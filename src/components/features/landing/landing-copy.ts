/**
 * All landing-page copy lives here as plain exported values, not inline JSX
 * literals — keeps the marketing page's strings in one reviewable place and
 * sidesteps eslint's `i18next/no-literal-string` (jsx-only mode: literals
 * inside JSX are flagged, references to a variable are not). This page isn't
 * run through i18next itself yet; if/when the marketing site needs real
 * localization, these become the source for new translation.json keys.
 */

export const NAV = {
  wordmark: "NeoDevEx",
  cta: "Try NeoDevEx",
};

export const HERO = {
  eyebrow: "NeoDevEx",
  title: "An AI engineer that ships real code.",
  subtitle:
    "Describe what you're building or point it at a repo. NeoDevEx reads the code, plans the change, and does the work — real bash commands, real file edits, real browser tools — in a sandboxed agent server running on your own machine.",
  cta: "Try NeoDevEx",
  ctaSub: "No credit card. Runs locally with your own Gemini key.",
};

export const FEATURES = {
  eyebrow: "What it actually does",
  title: "Not a chatbot. An agent that finishes the job.",
  items: [
    {
      title: "Any repo, any task",
      description:
        "Paste a GitHub link or just describe an idea. The agent investigates the codebase before it touches anything.",
    },
    {
      title: "Real tool use",
      description:
        "Bash, file edits, and browser automation run through a real local agent server — not a simulation of what it would do.",
    },
    {
      title: "Bring your own model",
      description:
        "Gemini is wired up by default, but you can point any conversation at a different LLM profile from Settings.",
    },
    {
      title: "Self-hosted, your machine",
      description:
        "The agent server runs locally via a lightweight Python process — no Docker required, no code leaves your machine unless you choose it.",
    },
  ],
};

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  title: "From idea to shipped change",
  steps: [
    {
      number: "01",
      title: "Describe what you want",
      description:
        "Tell it what you're building, or hand it a repo link. No setup, no config files to write first.",
    },
    {
      number: "02",
      title: "The agent investigates",
      description:
        "It reads the code, forms a plan, and asks clarifying questions when it genuinely needs to.",
    },
    {
      number: "03",
      title: "It does the work",
      description:
        "Real commands, real edits — you watch it happen in the conversation, not a progress bar.",
    },
    {
      number: "04",
      title: "You review and ship",
      description:
        "Every change is inspectable before it goes anywhere. Nothing merges itself.",
    },
  ],
};

export const CTA_BAND = {
  title: "Ready to build?",
  subtitle: "Open the console and describe what you want. That's it.",
  cta: "Try NeoDevEx",
};

export const FOOTER = {
  wordmark: "NeoDevEx",
  tagline: "An AI engineer for your codebase.",
};
