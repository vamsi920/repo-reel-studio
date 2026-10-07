import asyncio
import os
from collections.abc import AsyncIterator, Callable
from functools import partial

from api.chat import ChatStreamer, is_token_limit_error, prompt_builder
from api.config import configs, get_model_config
from api.logger import get_logger
from api.prompts import (
    DEEP_RESEARCH_FINAL_ITERATION_PROMPT,
    DEEP_RESEARCH_FIRST_ITERATION_PROMPT,
    DEEP_RESEARCH_INTERMEDIATE_ITERATION_PROMPT,
    SIMPLE_CHAT_SYSTEM_PROMPT,
)
from api.rag import RAG, count_tokens, repo_index_exist
from api.repository import Repo
from api.schemas.base import RepoRequestBase
from api.schemas import ChatCompletionRequest

logger = get_logger(__name__)


# Maximum token limit for embedding models
MAX_INPUT_TOKENS = 7500  # Safe threshold below 8192 token limit


# Token budget for whole files added to a chat answer's context, and the
# largest single file worth inlining (bigger ones stay as fragments).
ASK_FULL_FILE_TOKEN_BUDGET = int(os.environ.get("DEEPWIKI_ASK_FULL_FILE_TOKENS", 90000))
ASK_MAX_FULL_FILE_TOKENS = 20000


ASK_PLANNER_MODEL = os.environ.get("DEEPWIKI_ASK_PLANNER_MODEL", "gemini-2.5-flash")
ASK_PLANNER_MAX_FILES = 12
STREAM_RETRIES = 2
ASK_PLANNER_TREE_LIMIT = 6000

_PLANNER_PROMPT = """You are choosing which files an engineer must read to answer a question about the repository {repo_name}.

Question: {query}

Files the search index already matched (most relevant first):
{retrieved}

Complete file list of the repository:
{tree}

Pick at most {max_files} files whose FULL contents are needed to answer precisely. Prefer the
files that define the behaviour asked about. For questions about tooling, tests, builds, CI,
linting or supported versions, include the manifests and configs that define them (for example
pyproject.toml, package.json, tox.ini, setup.cfg, vitest/jest configs, .github/workflows/*).
Return ONLY a JSON array of paths copied exactly from the file list."""


async def _plan_files(request, query: str, retrieved: list[str]) -> list[str]:
    """Ask a cheap model which whole files the answer needs.

    Embedding search alone surfaces fragments that look similar to the
    question, which misses manifests/CI configs and the file that actually
    owns a behaviour. Returns [] on any failure so retrieval still answers.
    """
    import json as _json

    from api.config import iterate_files

    try:
        root = Repo(repo_url=request.repo_url, repo_type=request.type).save_path
        files = await asyncio.to_thread(
            iterate_files, root, request.excluded_dirs, request.excluded_files,
            request.included_dirs, request.included_files,
        )
        if not files:
            return []
        tree = "\n".join(sorted(files)[:ASK_PLANNER_TREE_LIMIT])
        prompt = _PLANNER_PROMPT.format(
            repo_name=request.repo_url.rstrip("/").split("/")[-1],
            query=query,
            retrieved="\n".join(retrieved[:20]) or "(none)",
            tree=tree,
            max_files=ASK_PLANNER_MAX_FILES,
        )
        streamer = ChatStreamer.create(
            provider=request.provider,
            model=ASK_PLANNER_MODEL if request.provider == "google" else request.model,
            model_config=get_model_config(request.provider, request.model)["model_kwargs"],
        )
        text = "".join([t async for t in streamer.respond_stream(prompt)])
        start, end = text.find("["), text.rfind("]")
        picked = _json.loads(text[start : end + 1]) if start != -1 and end > start else []
        known = set(files)
        return [p for p in picked if isinstance(p, str) and p in known][:ASK_PLANNER_MAX_FILES]
    except Exception as e:  # noqa: BLE001 - planning is an optimisation
        logger.warning("File planning failed, using retrieval only: %s", e)
        return []


def _expand_full_files(request, docs_by_file: dict, planned: list[str] | None = None) -> dict[str, str]:
    """Line-numbered full contents of the planned and most-retrieved files.

    Planned files come first; retrieved files are ranked by how many chunks
    they contributed (ties keep retrieval order), within a token budget.
    """
    try:
        root = Repo(repo_url=request.repo_url, repo_type=request.type).save_path
    except Exception:  # noqa: BLE001 - fragments alone still answer
        return {}
    by_hits = sorted(docs_by_file, key=lambda p: -len(docs_by_file[p]))
    ranked = list(dict.fromkeys([*(planned or []), *by_hits]))
    out: dict[str, str] = {}
    used = 0
    for rel in ranked:
        path = os.path.realpath(os.path.join(root, rel))
        if not path.startswith(os.path.realpath(root) + os.sep) or not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        tokens = count_tokens(text, embedder_type=request.provider)
        if tokens > ASK_MAX_FULL_FILE_TOKENS or used + tokens > ASK_FULL_FILE_TOKEN_BUDGET:
            continue
        out[rel] = "\n".join(f"{i:>5}| {line}" for i, line in enumerate(text.splitlines(), 1))
        used += tokens
    return out


class RepoNotIndexedError(ValueError):
    """Raised when a chat request arrives before the repo has been indexed."""


async def prepare_repo_index(
    request: RepoRequestBase,
) -> RAG:
    rag = await asyncio.to_thread(
        RAG,
        provider=request.provider,
        model=request.model,
    )
    # Extract custom file filter parameters if provided
    if request.excluded_dirs:
        logger.info(f"Using custom excluded directories: {request.excluded_dirs}")
    if request.excluded_files:
        logger.info(f"Using custom excluded files: {request.excluded_files}")
    if request.included_dirs:
        logger.info(f"Using custom included directories: {request.included_dirs}")
    if request.included_files:
        logger.info(f"Using custom included files: {request.included_files}")

    await rag.aprepare_retriever(
        request.repo_url,
        request.type,
        request.token,
        excluded_files=request.excluded_files,
        excluded_dirs=request.excluded_dirs,
        included_files=request.included_files,
        included_dirs=request.included_dirs,
    )
    return rag


async def research_chat(
    request: ChatCompletionRequest,
    skip_rag: bool = False,
    raise_errors: bool = False,
) -> AsyncIterator[str]:
    """Stream an answer. With ``raise_errors`` a provider failure raises
    instead of being streamed as text: wiki generation stores the stream as
    page content, so an inline "Error with google API" message would be
    published as documentation rather than retried."""
    input_too_large = False
    if request.messages and len(request.messages) > 0:
        last_message = request.messages[-1]
        if hasattr(last_message, "content") and last_message.content:
            tokens = count_tokens(last_message.content, embedder_type=request.provider)
            logger.info(f"Request size: {tokens} tokens")
            if tokens > MAX_INPUT_TOKENS:
                logger.warning(
                    f"Request exceeds recommended token limit ({tokens} > {MAX_INPUT_TOKENS})"
                )
                input_too_large = True

    repo = Repo(repo_url=request.repo_url, repo_type=request.type)
    if not repo_index_exist(repo=repo):
        logger.warning(
            "Repo %s is not indexed yet. Call `/repo/prepare` first if encounter Timeout",
            repo.name,
        )

    try:
        rag = await prepare_repo_index(request=request)
        logger.info("Retriever prepared for %s", request.repo_url)

    except ValueError as e:
        if "No valid documents with embeddings found" in str(e):
            logger.error(f"No valid embeddings found: {str(e)}")
            raise e
        else:
            logger.error("ValueError preparing retriever: %s", str(e))
            raise e
    except Exception as e:
        logger.error("Error preparing retriever: %s", str(e))
        raise e

    if not request.messages:
        raise ValueError("No messages provided")

    last_message = request.messages[-1]
    is_deep_research = last_message.mode == "deep_research"

    if last_message.role != "user":
        raise ValueError("Last message must be from the user")

    # Process previous messages to build conversation history
    for i in range(0, len(request.messages) - 1, 2):
        if i + 1 < len(request.messages):
            user_msg = request.messages[i]
            assistant_msg = request.messages[i + 1]

            if user_msg.role == "user" and assistant_msg.role == "assistant":
                rag.memory.add_dialog_turn(
                    user_query=user_msg.content,
                    assistant_response=assistant_msg.content,
                )

    if is_deep_research:
        logger.info(
            "Deep Research request detected - iteration %d", request.research_iteration
        )

        # Check if this is a continuation request
        if (
            "continue" in last_message.content.lower()
            and "research" in last_message.content.lower()
        ):
            # Find the original topic from the first user message
            original_topic = None
            for msg in request.messages:
                if msg.role == "user" and "continue" not in msg.content.lower():
                    original_topic = msg.content.strip()
                    logger.info(f"Found original research topic: {original_topic}")
                    break

            if original_topic:
                # Replace the continuation message with the original topic
                last_message.content = original_topic
                logger.info(f"Using original topic for research: {original_topic}")

    # Get the query from the last message
    query = last_message.content

    # Only retrieve documents if input is not too large
    context_text = ""

    # Page generation already builds its prompt from an explicit, budgeted,
    # line-numbered set of files (_build_file_contents_block in tasks.py) --
    # this generic retrieval is designed for open-ended chat and, left on,
    # unconditionally re-searches the ENTIRE repo unscoped to that declared
    # file set, surfacing undeclared files with unreliable chunk-level line
    # numbers as if they were as trustworthy as the explicit citations.
    if not input_too_large and not skip_rag:
        try:
            rag_query = query
            # Try to perform RAG retrieval
            try:
                # This will use the actual RAG implementation
                retrieved_documents = await rag.acall(
                    rag_query, language=request.language
                )

                if retrieved_documents and retrieved_documents[0].documents:
                    # Format context for the prompt in a more structured way
                    documents = retrieved_documents[0].documents
                    logger.info(f"Retrieved {len(documents)} documents")

                    # Group documents by file path
                    docs_by_file = {}
                    for doc in documents:
                        file_path = doc.meta_data.get("file_path", "unknown")
                        if file_path not in docs_by_file:
                            docs_by_file[file_path] = []
                        docs_by_file[file_path].append(doc)

                    # Retrieval returns ~350-word fragments. Answering from a
                    # fragment makes the model guess the rest of a function
                    # (benchmarked: invented calls and missing branches on
                    # flow/ordering questions), so the most-hit files are
                    # given in full, line-numbered, within a token budget.
                    planned = (
                        []
                        if is_deep_research
                        else await _plan_files(request, query, list(docs_by_file))
                    )
                    full_files = _expand_full_files(request, docs_by_file, planned)

                    # Format context text with file path grouping
                    context_parts = []
                    for file_path, numbered in full_files.items():
                        context_parts.append(
                            f"## File Path: {file_path} (full file, line-numbered)\n\n{numbered}"
                        )
                    for file_path, docs in docs_by_file.items():
                        if file_path in full_files:
                            continue
                        # Add file header with metadata
                        header = f"## File Path: {file_path}\n\n"
                        # Add document content, annotating each chunk with its
                        # real line range when available so the model can cite lines.
                        chunk_texts = []
                        for doc in docs:
                            start_line = doc.meta_data.get("start_line")
                            end_line = doc.meta_data.get("end_line")
                            if start_line and end_line:
                                chunk_texts.append(
                                    f"[lines {start_line}-{end_line}]\n{doc.text}"
                                )
                            else:
                                chunk_texts.append(doc.text)
                        content = "\n\n".join(chunk_texts)

                        context_parts.append(f"{header}{content}")

                    # Join all parts with clear separation
                    context_text = "\n\n" + "-" * 10 + "\n\n".join(context_parts)
                else:
                    logger.warning("No documents retrieved from RAG")
            except Exception as e:
                logger.error(f"Error in RAG retrieval: {str(e)}")
        except Exception as e:
            logger.error(f"Error retrieving documents: {str(e)}")
            context_text = ""

    # Get repository information
    repo_url = request.repo_url
    repo_name = repo_url.split("/")[-1] if "/" in repo_url else repo_url

    # Determine repository type
    repo_type = request.type

    # Get language information
    language_code = request.language or configs["lang_config"]["default"]
    supported_langs = configs["lang_config"]["supported_languages"]
    language_name = supported_langs.get(language_code, "English")

    # Create system prompt
    if is_deep_research:
        # Check if this is the first iteration
        is_first_iteration = request.research_iteration == 1

        # Check if this is the final iteration
        is_final_iteration = request.research_iteration >= 5

        if is_first_iteration:
            system_prompt = DEEP_RESEARCH_FIRST_ITERATION_PROMPT.format(
                repo_type=repo_type,
                repo_url=repo_url,
                repo_name=repo_name,
                language_name=language_name,
            )
        elif is_final_iteration:
            system_prompt = DEEP_RESEARCH_FINAL_ITERATION_PROMPT.format(
                repo_type=repo_type,
                repo_url=repo_url,
                repo_name=repo_name,
                language_name=language_name,
            )
        else:
            system_prompt = DEEP_RESEARCH_INTERMEDIATE_ITERATION_PROMPT.format(
                repo_type=repo_type,
                repo_url=repo_url,
                repo_name=repo_name,
                research_iteration=request.research_iteration,
                language_name=language_name,
            )
    else:
        system_prompt = SIMPLE_CHAT_SYSTEM_PROMPT.format(
            repo_type=repo_type,
            repo_url=repo_url,
            repo_name=repo_name,
            language_name=language_name,
        )

    # Format conversation history
    conversation_history = ""
    for turn_id, turn in rag.memory().items():
        if (
            not isinstance(turn_id, int)
            and hasattr(turn, "user_query")
            and hasattr(turn, "assistant_response")
        ):
            conversation_history += f"<turn>\n<user>{turn.user_query.query_str}</user>\n<assistant>{turn.assistant_response.response_str}</assistant>\n</turn>\n"

    async def stream_and_fallback(
        streamer: ChatStreamer,
        prompt_func: Callable[[], str],
        simplified_prompt_func: Callable[[], str],
    ) -> AsyncIterator[str]:
        sent = False
        try:
            for attempt in range(STREAM_RETRIES + 1):
                try:
                    async for chunk in streamer.respond_stream(prompt_func()):
                        sent = True
                        yield chunk
                    break
                except Exception as retry_error:
                    # A transient provider failure before any text arrived
                    # (dropped stream, 503) is retried; once text has been
                    # sent the caller already holds a partial answer.
                    if sent or attempt == STREAM_RETRIES or is_token_limit_error(retry_error):
                        raise
                    logger.warning("Model stream failed before output, retrying: %s", retry_error)
                    await asyncio.sleep(2 * (attempt + 1))
        except Exception as e:
            if is_token_limit_error(e) and not raise_errors:
                logger.warning("Token limit exceeded, retrying without context")
                try:
                    async for chunk in streamer.respond_stream(
                        simplified_prompt_func()
                    ):
                        yield chunk
                except Exception as e2:
                    logger.error("Error in fallback streaming response: %s", str(e2))
                    yield (
                        "\nI apologize, but your request is too large for me to process. "
                        "Please try a shorter query or break it into smaller parts."
                    )
            else:
                if raise_errors:
                    raise
                error_str = f"Error with {streamer.provider} API: {e}"
                logger.error(error_str, exc_info=True)
                if streamer.error_hint:
                    error_str += f"\n\n{streamer.error_hint}"
                yield "\n" + error_str

    model_config = get_model_config(request.provider, request.model)["model_kwargs"]
    chat_streamer = ChatStreamer.create(
        provider=request.provider,
        model=request.model,
        model_config=model_config,
    )

    prompt_kwargs = {
        "system_prompt": system_prompt,
        "query": query,
        "conversation_history": conversation_history,
        "context": context_text,
    }

    prompt_func = partial(prompt_builder, **prompt_kwargs, simplify=False)
    simplified_prompt_func = partial(prompt_builder, **prompt_kwargs, simplify=True)

    return stream_and_fallback(
        streamer=chat_streamer,
        prompt_func=prompt_func,
        simplified_prompt_func=simplified_prompt_func,
    )
