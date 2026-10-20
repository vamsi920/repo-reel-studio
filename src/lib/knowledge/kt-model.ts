/**
 * Model the KT engine uses for page generation and repository Q&A. Left
 * unset, the DeepWiki service silently resolves to its default
 * (gemini-2.5-flash); pro gives noticeably better grounding.
 */
export const KT_LLM_MODEL = "gemini-2.5-pro";
export const KT_LLM_PROVIDER = "google";
