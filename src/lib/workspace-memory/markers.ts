/**
 * Delimiters of the workspace-memory block prepended to prompts. Kept apart
 * from `render.ts` so the chat renderer can hide the block without pulling
 * the compression pipeline into its bundle.
 */
export const MEMORY_BLOCK_START = "<!-- neodevex:workspace-memory:start -->";
export const MEMORY_BLOCK_END = "<!-- neodevex:workspace-memory:end -->";
