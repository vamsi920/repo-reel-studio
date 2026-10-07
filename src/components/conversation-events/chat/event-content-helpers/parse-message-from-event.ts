import { MessageEvent } from "#/types/agent-server/core";
import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import {
  MEMORY_BLOCK_END,
  MEMORY_BLOCK_START,
} from "#/lib/workspace-memory/markers";
import {
  KT_DOCS_BLOCK_END,
  KT_DOCS_BLOCK_START,
} from "#/lib/knowledge/kt-format";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Context the app prepends to a user's message for the agent (workspace
 * memory, KT docs pointers). The agent needs it; the user never typed it, so
 * it must not show up in their own chat bubble after a reload. */
const INJECTED_CONTEXT_PATTERN = new RegExp(
  [
    [MEMORY_BLOCK_START, MEMORY_BLOCK_END],
    [KT_DOCS_BLOCK_START, KT_DOCS_BLOCK_END],
  ]
    .map(
      ([start, end]) =>
        `${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\s*`,
    )
    .join("|"),
  "g",
);

export function stripInjectedContext(text: string): string {
  return text.includes(MEMORY_BLOCK_START) || text.includes(KT_DOCS_BLOCK_START)
    ? text.replace(INJECTED_CONTEXT_PATTERN, "").trimStart()
    : text;
}

export const parseMessageFromEvent = (event: MessageEvent): string => {
  const message = event.llm_message;

  // Safety check: ensure llm_message exists and has content
  if (!message?.content) {
    return "";
  }

  // Get the text content from the message
  let textContent = "";
  if (message.content) {
    if (Array.isArray(message.content)) {
      // Handle array of content blocks
      textContent = message.content
        .filter((content) => content.type === "text")
        .map((content) => content.text)
        .join("\n");
    } else if (typeof message.content === "string") {
      // Handle string content
      textContent = message.content;
    }
  }

  // Check if there are image_urls in the message content
  const hasImages =
    Array.isArray(message.content) &&
    message.content.some((content) => content.type === "image");

  if (event.source === "user") {
    textContent = stripInjectedContext(textContent);
  }

  if (!hasImages) {
    return textContent;
  }

  // If there are images, try to split by the augmented prompt delimiter
  const delimiter = i18n.t(I18nKey.CHAT_INTERFACE$AUGMENTED_PROMPT_FILES_TITLE);
  const parts = textContent.split(delimiter);

  return parts[0];
};
