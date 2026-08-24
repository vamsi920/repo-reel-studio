/**
 * All landing-page copy lives here as plain exported values, not inline JSX
 * literals — keeps the marketing page's strings in one reviewable place and
 * sidesteps eslint's `i18next/no-literal-string` (jsx-only mode: literals
 * inside JSX are flagged, references to a variable are not). This page isn't
 * run through i18next itself yet; if/when the marketing site needs real
 * localization, these become the source for new translation.json keys.
 */

export const NAV = {
  wordmark: "Neo",
  cta: "Try Neo",
};

export const HERO = {
  eyebrow: "Hire Neo",
  title: "Meet Neo — your autonomous software engineer.",
  subtitle:
    "Describe what you're building, hand it a repo, or assign it a ticket. Neo reads the code, plans the change, and does the work — real commands, real file edits, real browser tools — inside a governed, isolated sandbox deployed in your infrastructure or ours.",
  cta: "Try Neo",
  ctaSub: "Enterprise-grade models included — no API keys, nothing to bring.",
};

export const PROBLEM = {
  eyebrow: "Why teams stall",
  title: "Context lives in people. It should live in the system.",
  subtitle:
    "Architecture knowledge, prior decisions, and the reasoning behind past changes end up scattered across chat threads, tickets, and the one engineer who remembers. Neo keeps that context attached to the repo, not a person.",
  items: [
    {
      title: "Rebuilding context is expensive",
      description:
        "Every new task starts with re-reading the codebase, because nothing carries context forward from the last one.",
    },
    {
      title: "Answers are scattered",
      description:
        "Docs, tickets, and old PR threads each hold part of the picture — rarely in one place when it's actually needed.",
    },
    {
      title: "Review starts from zero",
      description:
        "Changes get judged without full system context, which makes risk harder to see and onboarding slower.",
    },
    {
      title: "Institutional knowledge walks out the door",
      description:
        "Critical context lives with a handful of engineers instead of staying attached to the repository itself.",
    },
  ],
};

export const FEATURES = {
  eyebrow: "What it actually does",
  title: "Not a chatbot. An agent that finishes the job.",
  items: [
    {
      title: "Any stack, any repo",
      description:
        "GitHub, GitLab, or a bare repo — TypeScript, Python, Java, Go. Neo investigates the codebase before it touches anything, flexible with any enterprise tech stack.",
    },
    {
      title: "Real tool use",
      description:
        "Bash, file edits, and browser automation run through a governed agent runtime — not a simulation of what it would do.",
    },
    {
      title: "Enterprise-grade models, included",
      description:
        "Neo provisions and manages best-in-class models for every session — governed model access, nothing to configure, nothing to bring.",
    },
    {
      title: "Your infrastructure, your control",
      description:
        "Deploy inside your cloud, your VPC, or ours — isolated sandboxes either way, with no code leaving your perimeter without your say-so.",
    },
  ],
};

export const TRUST = {
  eyebrow: "Trust & safety",
  title: "Governed autonomy, not unchecked automation",
  items: [
    {
      title: "Policy guardrails",
      description:
        "Command allowlists, path restrictions, and network policy — every agent action is gated before it runs.",
    },
    {
      title: "Isolated sandboxes",
      description:
        "Each session runs in its own isolated environment with no standing access to your secrets or infrastructure.",
    },
    {
      title: "Full audit trail",
      description:
        "Every read, edit, command, and decision is logged with timestamps and evidence you can replay end to end.",
    },
    {
      title: "Human in the loop",
      description:
        "Changes land as reviewable diffs, never auto-merged. You approve, request changes, or reject.",
    },
  ],
};

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  title: "From idea to shipped change",
  steps: [
    {
      number: "01",
      title: "Hand it a ticket or a repo",
      description:
        "Paste a repo link, describe what you're building, or connect your tracker and assign it a ticket. No config files to write first.",
    },
    {
      number: "02",
      title: "The agent investigates",
      description:
        "It reads the code, recalls prior context, forms a plan, and asks clarifying questions when it genuinely needs to.",
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
        "Every change is inspectable and every action logged before it goes anywhere. Nothing merges itself.",
    },
  ],
};

export const CTA_BAND = {
  title: "Onboard your first digital engineer today.",
  subtitle:
    "Open the console, hand it a repo or a ticket, and watch it work — governed, audited, and ready to ship.",
  cta: "Try Neo",
};

export const FOOTER = {
  wordmark: "Neo",
  tagline: "An autonomous AI engineer for enterprise engineering teams.",
};
