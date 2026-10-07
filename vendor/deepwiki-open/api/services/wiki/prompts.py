"""Prompt builders for backend wiki generation.

Ported verbatim from the frontend page.tsx prompts (page + structure), so the
backend produces the same output.
"""

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "ja": "Japanese (日本語)",
    "zh": "Mandarin Chinese (中文)",
    "zh-tw": "Traditional Chinese (繁體中文)",
    "es": "Spanish (Español)",
    "kr": "Korean (한국어)",
    "vi": "Vietnamese (Tiếng Việt)",
    "pt-br": "Brazilian Portuguese (Português Brasileiro)",
    "fr": "Français (French)",
    "ru": "Русский (Russian)",
}


def language_name(language: str) -> str:
    return LANGUAGE_NAMES.get(language, "English")


def build_page_prompt(
    title: str,
    file_links: str,
    file_contents: str,
    language: str,
    code_evidence: str | None = None,
) -> str:
    """Prompt for generating a single wiki page (port of generatePageContent).

    `file_links` is the pre-built markdown list of ``- [path](url)`` lines that
    seeds the required <details> block. `file_contents` is the REAL,
    line-numbered content of those same files, read off disk by the caller —
    without it the model has nothing but a list of filenames and falls back
    to paraphrasing whatever prose (READMEs) it can find instead of citing
    real code. `code_evidence`, when present, is a short page-scoped slice of
    real detected subsystems this page's files belong to — structural
    context only, never a citation source of its own (it has no line
    numbers; citations still come exclusively from SOURCE FILE CONTENTS).
    """
    evidence_block = (
        f"\n\nADDITIONAL STRUCTURAL CONTEXT (not a citation source — use it "
        f"only to understand how this page's files relate to the rest of "
        f"the codebase, never to cite a line number):\n\n{code_evidence}\n"
        if code_evidence
        else ""
    )
    return f"""You are an expert technical writer and software architect.
Your task is to generate a comprehensive and accurate technical wiki page in Markdown format about a specific feature, system, or module within a given software project.

You will be given:
1. The "[WIKI_PAGE_TOPIC]" for the page you need to create.
2. The full, line-numbered content of every "[RELEVANT_SOURCE_FILES]" for this page, below under "SOURCE FILE CONTENTS" — this is the ONLY material you may draw on. Any file you couldn't be given content for is listed as unavailable there; do not write about it. You MUST use AT LEAST 5 relevant source files for comprehensive coverage - if fewer are provided, base the page on what is actually in the ones you do have rather than inventing additional ones.

CRITICAL STARTING INSTRUCTION:
The very first thing on the page MUST be a `<details>` block listing ALL the `[RELEVANT_SOURCE_FILES]` you used to generate the content. There MUST be AT LEAST 5 source files listed - if fewer were provided, you MUST find additional related files to include.
Do not provide any acknowledgements, disclaimers, apologies, or any other preface before the `<details>` block. JUST START with the `<details>` block.
Format the block EXACTLY like the following template, reproducing it verbatim (do not add line numbers, do not convert the links to plain text, do not add any other text):
<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

{file_links}
<!-- Add additional relevant files if fewer than 5 were provided -->
</details>

Immediately after the `<details>` block, the main title of the page should be a H1 Markdown heading: `# {title}`.

SOURCE FILE CONTENTS — every line is prefixed with its real 1-based line
number in that file (e.g. `42: def foo():`). Copy these numbers exactly
when you cite `path:start-end` — do not count lines yourself, use the
numbers shown.

{file_contents}
{evidence_block}
Based ONLY on the content shown above under SOURCE FILE CONTENTS (the
ADDITIONAL STRUCTURAL CONTEXT above, if present, is for your own
understanding only — never cite it as a source):

1.  **Introduction:** Start with a concise introduction (1-2 paragraphs) explaining the purpose, scope, and high-level overview of "{title}" within the context of the overall project. If relevant, and if information is available in the provided files, link to other potential wiki pages using the format `[Link Text](#page-anchor-or-id)`. Do NOT open with a templated preamble sentence like "This document outlines..." or "This document provides a comprehensive guide/overview..." — open with something concrete and specific to what "{title}" actually is or does, grounded in the source files above.

2.  **Detailed Sections:** Break down "{title}" into logical sections using H2 (`##`) and H3 (`###`) Markdown headings. For each section:
    *   Explain the architecture, components, data flow, or logic relevant to the section's focus, as evidenced in the source files.
    *   Identify key functions, classes, data structures, API endpoints, or configuration elements pertinent to that section.

3.  **Mermaid Diagrams:**
    *   EXTENSIVELY use Mermaid diagrams (e.g., `flowchart TD`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `graph TD`) to visually represent architectures, flows, relationships, and schemas found in the source files.
    *   Ensure diagrams are accurate and directly derived from information in the `[RELEVANT_SOURCE_FILES]`.
    *   Provide a brief explanation before or after each diagram to give context.
    *   CRITICAL: node labels containing parentheses MUST be wrapped in double quotes, e.g. `A["CAD Files (.dxf/.dwg)"]`, NOT `A[CAD Files (.dxf/.dwg)]` — an unquoted `(` inside a `[...]`/`{{...}}` label breaks the parser. This applies to file extensions, framework names, and function-call syntax alike — quote the whole label whenever it contains a `(`.
    *   CRITICAL: All diagrams MUST follow strict vertical orientation:
       - Use "graph TD" (top-down) directive for flow diagrams
       - NEVER use "graph LR" (left-right)
       - Maximum node width should be 3-4 words
       - For sequence diagrams:
         - Start with "sequenceDiagram" directive on its own line
         - Define ALL participants at the beginning using "participant" keyword
         - Mermaid supports exactly two participant keywords: "participant" and "actor" — there are no other typed participant keywords (no "boundary"/"control"/"entity"/"database"/"collections"/"queue"; that is PlantUML syntax, not Mermaid, and will fail to parse)
         - Use descriptive but concise participant names, or use aliases: "participant A as Alice"
         - Use the correct Mermaid arrow syntax (8 types available):
           - -> solid line without arrow (rarely used)
           - --> dotted line without arrow (rarely used)
           - ->> solid line with arrowhead (most common for requests/calls)
           - -->> dotted line with arrowhead (most common for responses/returns)
           - ->x solid line with X at end (failed/error message)
           - -->x dotted line with X at end (failed/error response)
           - -) solid line with open arrow (async message, fire-and-forget)
           - --) dotted line with open arrow (async response)
           - Examples: A->>B: Request, B-->>A: Response, A->xB: Error, A-)B: Async event
         - Use +/- suffix for activation boxes: A->>+B: Start (activates B), B-->>-A: End (deactivates B)
         - Group related participants using "box": box GroupName ... end
         - Use structural elements for complex flows:
           - loop LoopText ... end (for iterations)
           - alt ConditionText ... else ... end (for conditionals)
           - opt OptionalText ... end (for optional flows)
           - par ParallelText ... and ... end (for parallel actions)
           - critical CriticalText ... option ... end (for critical regions)
           - break BreakText ... end (for breaking flows/exceptions)
         - Add notes for clarification: "Note over A,B: Description", "Note right of A: Detail"
         - Use autonumber directive to add sequence numbers to messages
         - NEVER use flowchart-style labels like A--|label|-->B. Always use a colon for labels: A->>B: My Label

4.  **Tables:**
    *   Use Markdown tables to summarize information such as:
        *   Key features or components and their descriptions.
        *   API endpoint parameters, types, and descriptions.
        *   Configuration options, their types, and default values.
        *   Data model fields, types, constraints, and descriptions.

5.  **Code Snippets (ENTIRELY OPTIONAL):**
    *   Include short, relevant code snippets (e.g., Python, Java, JavaScript, SQL, JSON, YAML) directly from the `[RELEVANT_SOURCE_FILES]` to illustrate key implementation details, data structures, or configurations.
    *   Ensure snippets are well-formatted within Markdown code blocks with appropriate language identifiers.

6.  **Source Citations (EXTREMELY IMPORTANT):**
    *   For EVERY piece of significant information, explanation, diagram, table entry, or code snippet, you MUST cite the specific source file(s) and relevant line numbers from which the information was derived.
    *   Place citations at the end of the paragraph, under the diagram/table, or after the code snippet.
    *   Use the EXACT format below, and ALWAYS use the FULL repository-relative path exactly as it appears in the "Relevant source files" list above — NEVER a bare filename (e.g. use `src/lightning/pytorch/loops/fit_loop.py`, not `fit_loop.py`):
        *   Range: `Sources: [src/full/path/file.ext:start_line-end_line]()`
        *   Single line: `Sources: [src/full/path/file.ext:line_number]()`
        *   Multiple files: `Sources: [src/full/path/a.ext:1-10](), [src/full/path/b.ext:5](), [src/full/path/c.ext]()` (omit line numbers when the whole file is relevant).
    *   The word `Sources:` MUST be placed BEFORE the opening bracket, never inside it (write `Sources: [path]()`, NOT `[Sources: path]()`).
    *   Leave the parentheses `()` EMPTY — they are resolved into real links automatically. Do not put a URL inside them.
    *   If an entire section is overwhelmingly based on one or two files, you can cite them under the section heading in addition to more specific citations within the section.
    *   IMPORTANT: You MUST cite AT LEAST 5 different source files throughout the wiki page to ensure comprehensive coverage.

7.  **Precision and completeness (benchmarked: these are the questions new engineers ask):**
    *   Every file in SOURCE FILE CONTENTS must be explained somewhere on the page: what it is for, its main exports, and how it connects to the rest. Small files may share a table; never silently skip one.
    *   State exact values, not paraphrases: default option values, constants, status codes, ordering of hooks/handlers/middleware, the conditions under which a branch runs, and the exception or error type raised. Quote the literal value from the code and cite the line.
    *   When the page describes a flow, walk it step by step in execution order, naming the function at each step, including what happens on errors, retries and early returns.
    *   Include a `## Edge cases and gotchas` section listing behaviour that a reasonable reader would guess wrong (surprising defaults, things that are NOT done, renamed or removed options, precedence rules, limits), each with a citation. Omit the section only if the files genuinely contain none.
    *   If the files include manifests, CI workflows, test or lint configs, state the exact commands, tools, runtime/language versions and CI matrix they define.

8.  **Technical Accuracy:** All information must be derived SOLELY from the `[RELEVANT_SOURCE_FILES]`. Do not infer, invent, or use external knowledge about similar systems or common practices unless it's directly supported by the provided code. If information is not present in the provided files, do not include it or explicitly state its absence if crucial to the topic.

9.  **Clarity and Conciseness:** Use clear, professional, and concise technical language suitable for other developers working on or learning about the project. Avoid unnecessary jargon, but use correct technical terms where appropriate.

10. **Conclusion/Summary:** End with a brief summary paragraph if appropriate for "{title}", reiterating the key aspects covered and their significance within the project.

IMPORTANT: Generate the content in {language_name(language)} language.

Remember:
- Ground every claim in the provided source files.
- Prioritize accuracy and direct representation of the code's functionality and structure.
- Structure the document logically for easy understanding by other developers.
"""


_COMPREHENSIVE_STRUCTURE = """
Determine the wiki's sections yourself, grounded in what THIS repository
actually contains. Do not reuse a generic template — reaching for the same
handful of section names ("Data Management", "Model Integration", "Backend
Systems") on every repository regardless of whether it actually has one is
the single most common failure mode to avoid here.

Use the evidence given above (the file tree, the README, and — when present
— the CODE STRUCTURE EVIDENCE block from real static analysis) to find this
repository's own distinct subsystems: its real business flows, runtime
components, external integrations, persistence layer, background/agent
systems, UI surfaces, build/deploy tooling — but only the ones this
repository actually has, named the way its own code and directories name
them, not picked from a fixed checklist. A small single-purpose library may
warrant 3 sections; a large multi-service platform may warrant 12. Let the
evidence decide both the count and the names.

Two organizing principles, not a template to fill in:
- Prefer names grounded in real module/directory boundaries (and, when given,
  the detected architectural layers) over abstract category labels.
- Each section should give a new engineer a mental model of one coherent
  part of this codebase — not an arbitrary slice of files.

Each section should contain relevant pages. For example, a UI-heavy
repository's front-end section might include pages for its actual named
screens or components — whatever they are actually called in this repo, not
placeholder names copied from an unrelated example project.

Return your analysis in the following XML format:

<wiki_structure>
  <title>[Overall title for the wiki]</title>
  <description>[Brief description of the repository]</description>
  <sections>
    <section id="section-1">
      <title>[Section title]</title>
      <pages>
        <page_ref>page-1</page_ref>
        <page_ref>page-2</page_ref>
      </pages>
      <subsections>
        <section_ref>section-2</section_ref>
      </subsections>
    </section>
    <!-- More sections as needed -->
  </sections>
  <pages>
    <page id="page-1">
      <title>[Page title]</title>
      <description>[Brief description of what this page will cover]</description>
      <importance>high|medium|low</importance>
      <relevant_files>
        <file_path>[Path to a relevant file]</file_path>
        <!-- More file paths as needed -->
      </relevant_files>
      <related_pages>
        <related>page-2</related>
        <!-- More related page IDs as needed -->
      </related_pages>
      <parent_section>section-1</parent_section>
    </page>
    <!-- More pages as needed -->
  </pages>
</wiki_structure>
"""

_CONCISE_STRUCTURE = """
Return your analysis in the following XML format:

<wiki_structure>
  <title>[Overall title for the wiki]</title>
  <description>[Brief description of the repository]</description>
  <pages>
    <page id="page-1">
      <title>[Page title]</title>
      <description>[Brief description of what this page will cover]</description>
      <importance>high|medium|low</importance>
      <relevant_files>
        <file_path>[Path to a relevant file]</file_path>
        <!-- More file paths as needed -->
      </relevant_files>
      <related_pages>
        <related>page-2</related>
        <!-- More related page IDs as needed -->
      </related_pages>
    </page>
    <!-- More pages as needed -->
  </pages>
</wiki_structure>
"""


def build_file_reference_prompt(title: str, file_contents: str, language: str) -> str:
    """Prompt for documenting the files a wiki page did not cover."""
    return f"""You are completing the technical wiki page "{title}". The page is already written,
but it does not cover the source files below. Write ONE Markdown section that documents them.

Start with the heading `## Other files in this area`. Then, for EACH file below, write a `### <path>`
subsection that explains, using ONLY that file's content:
- what the file is for and how it relates to "{title}";
- its main exports, functions, classes or settings, with exact default values, conditions,
  error types and ordering where the code defines them;
- anything surprising a new engineer would get wrong.
For test files, say which behaviours they verify. For config, CI or manifest files, list the exact
commands, tools, versions and options they define.

Cite every claim as `Sources: [path:start-end]()` using the line numbers shown (full
repository-relative path, empty parentheses). Do not repeat a page title, do not add a summary,
do not use Mermaid, and do not mention files that are not listed below.

SOURCE FILE CONTENTS (each line prefixed with its real line number):

{file_contents}

Write the section in {language_name(language)}."""


def comprehensive_page_range(
    comprehensive: bool,
    subsystem_count: int | None,
    source_file_count: int | None,
) -> str:
    """How many pages to ask for, scaled to the repository.

    A flat 8-12 left large repos thin: benchmarked against Devin's DeepWiki
    on ky / flask / hono, a 10-page wiki cited 19-33 distinct files where
    DeepWiki's 35-46 pages cited 55-183, and onboarding questions about the
    uncovered modules went unanswered. Concise mode stays small on purpose.
    """
    if not comprehensive:
        if subsystem_count:
            return f"{max(3, subsystem_count // 2)}-{max(4, min(8, subsystem_count + 2))}"
        return "4-6"
    files = source_file_count or 0
    # One page per ~4 source files, bounded. The second benchmark round
    # (74 pages vs DeepWiki's 118) still left 7 of 75 questions without an
    # answer in the docs, all about modules that had no page of their own.
    by_files = (max(16, min(50, files // 4)), max(24, min(58, files // 4 + 8)))
    if subsystem_count:
        low = max(by_files[0], subsystem_count + 4)
        high = max(by_files[1], low + 4)
    else:
        low, high = by_files
    return f"{low}-{min(high, 60)}"


def build_structure_prompt(
    owner: str,
    repo: str,
    file_tree: str,
    readme: str,
    comprehensive: bool,
    language: str,
    code_evidence: str | None = None,
    subsystem_count: int | None = None,
    source_file_count: int | None = None,
) -> str:
    """Prompt for determining the wiki structure (port of determineWikiStructure).

    `code_evidence` is optional, condensed real-code-structure evidence
    (detected subsystems, architectural layers, import/call edges) from
    NeoDevEx's own CodeGraph analyzer — real parsed-code signal, not
    guessed from file paths. When present it gives the model genuine
    bottom-up grounding beyond the file tree and README alone; when absent
    (analyzer unavailable/timed out), structure determination proceeds
    exactly as before.
    """
    structure_format = _COMPREHENSIVE_STRUCTURE if comprehensive else _CONCISE_STRUCTURE
    page_count = comprehensive_page_range(
        comprehensive, subsystem_count, source_file_count
    )
    kind = "comprehensive" if comprehensive else "concise"
    evidence_block = (
        f"""
3. Real code-structure evidence from static analysis (more reliable than
the file tree alone — it comes from parsing every file, not guessing from
paths):
<code_structure_evidence>
{code_evidence}
</code_structure_evidence>
"""
        if code_evidence
        else ""
    )
    return f"""Analyze this GitHub repository {owner}/{repo} and create a wiki structure for it.

1. The complete file tree of the project:
<file_tree>
{file_tree}
</file_tree>

2. The README file of the project:
<readme>
{readme}
</readme>
{evidence_block}
I want to create a wiki for this repository. Determine the most logical structure for a wiki based on the repository's content.

IMPORTANT: The wiki content will be generated in {language_name(language)} language.

When designing the wiki structure, include pages that would benefit from visual diagrams, such as:
- Architecture overviews
- Data flow descriptions
- Component relationships
- Process workflows
- State machines
- Class hierarchies
{structure_format}
IMPORTANT FORMATTING INSTRUCTIONS:
- Return ONLY the valid XML structure specified above
- DO NOT wrap the XML in markdown code blocks (no ``` or ```xml)
- DO NOT include any explanation text before or after the XML
- Ensure the XML is properly formatted and valid
- Start directly with <wiki_structure> and end with </wiki_structure>

IMPORTANT:
1. Create {page_count} pages that would make a {kind} wiki for this repository
   - Include an end-to-end lifecycle page that traces the main operation (a request, a call, a command) through every component in order.
   - Include a development workflow page covering build, test, lint, type-checking, CI and release, with the manifests and CI/config files as its relevant_files.
   - Give each significant module or subsystem its own page rather than folding several into one overview.
2. Each page should focus on a specific aspect of the codebase (e.g., architecture, key features, setup)
3. The relevant_files should be actual files from the repository that would be used to generate that page
4. Return ONLY valid XML with the structure specified above, with no markdown code block delimiters"""
