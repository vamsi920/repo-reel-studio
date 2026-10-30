/**
 * All landing-page copy lives here as plain exported values, not inline JSX
 * literals — keeps the marketing page's strings in one reviewable place and
 * sidesteps eslint's `i18next/no-literal-string` (jsx-only mode: literals
 * inside JSX are flagged, references to a variable are not). This page isn't
 * run through i18next itself yet; if/when the marketing site needs real
 * localization, these become the source for new translation.json keys.
 *
 * Every number on the page comes from Neo's published case studies
 * (`case-studies/chat`, `case-studies/tokens`); keep them in sync when those
 * are re-measured, and never add a figure that was not measured.
 */

/** Primary button label for a returning, signed-in user. */
export const CONSOLE_CTA = "Console";

export const NAV = {
  wordmark: "Neo",
  cta: "Try Neo",
  links: [
    { href: "#how", label: "How it works" },
    { href: "#platform", label: "Platform" },
    { href: "#studios", label: "Studios" },
    { href: "#trust", label: "Trust" },
  ],
};

export const HERO = {
  eyebrow: "The autonomous engineer for enterprise teams",
  titleLead: "Hand Neo the ticket.",
  titleTail: "Review the diff.",
  subtitle:
    "Neo reads your codebase, plans the change and does the work — real commands, real file edits, real browser tools — inside a governed sandbox in your cloud or ours. You approve what ships.",
  cta: "Try Neo",
  secondaryCta: "See it work",
  ctaSub: "Enterprise-grade models included. No API keys, nothing to install.",
};

/** The product window under the hero headline. */
export const WINDOW = {
  url: "neo.neodevex.com/conversations",
  nav: [
    "Conversations",
    "Knowledge",
    "Automations",
    "AgentOps",
    "Modernize",
    "Synth",
  ],
  title: "Fix the flaky checkout test",
  repo: "acme/storefront · main",
  prompt:
    "The checkout test fails about one run in five on CI. Find out why, fix it and open a PR.",
  steps: [
    "Read KT docs: checkout architecture",
    "Reproduced the failure in the sandbox (3 of 15 runs)",
    "Found a race in useCartTotals() — totals resolve after render",
    "Edited src/checkout/useCartTotals.ts",
    "Ran the suite 25× — 0 failures",
  ],
  diffFile: "src/checkout/useCartTotals.ts",
  diffRemoved: "  const totals = useMemo(() => sum(items), []);",
  diffAdded: "  const totals = useMemo(() => sum(items), [items]);",
  result: "PR #482 opened · 214 passed · waiting for your review",
  terminalTitle: "terminal",
  terminal: [
    "$ npm test -- checkout --repeat 25",
    "PASS src/checkout/CartSummary.test.tsx",
    "Tests: 214 passed, 214 total",
    "$ gh pr create --fill",
  ],
  status: "Live",
  cost: "$0.18 · 41k tokens",
};

export const STACK = {
  eyebrow: "Works with the stack you already run",
  items: [
    "TypeScript",
    "Python",
    "Java",
    "Go",
    "Rust",
    "React",
    "Node.js",
    "Kubernetes",
    "PostgreSQL",
    "Docker",
    "GitHub",
    "GitLab",
    "Jira",
    "Linear",
    "Slack",
    "Snowflake",
  ],
};

/** The scroll-filled manifesto. Words wrapped in *asterisks* get the accent. */
export const STATEMENT = {
  eyebrow: "Why teams stall",
  text: "Context lives in people. It should live in the *system.* Neo keeps the architecture, the decisions and the reasoning behind every change attached to the *repo* — not to the one engineer who remembers.",
};

export type StoryVisual = "ticket" | "investigate" | "work" | "review";

export interface StoryStep {
  visual: StoryVisual;
  number: string;
  title: string;
  description: string;
  ticketId?: string;
  ticketTitle?: string;
  ticketMeta?: string[];
  plan?: string[];
  question?: string;
  lines?: string[];
  checks?: string[];
  approve?: string;
  request?: string;
}

export const STORY = {
  eyebrow: "How it works",
  title: "From ticket to merged change, in one conversation.",
  steps: <StoryStep[]>[
    {
      visual: "ticket",
      number: "01",
      title: "Hand it a ticket, a repo or a sentence",
      description:
        "Paste a repo link, assign a Jira or Linear ticket, or just describe what you need. No config files, no prompt engineering.",
      ticketId: "ENG-4831",
      ticketTitle: "Refresh SSO sessions before they expire",
      ticketMeta: [
        "Priority: High",
        "Assignee: Neo",
        "Repo: acme/auth-service",
      ],
    },
    {
      visual: "investigate",
      number: "02",
      title: "Neo investigates before it touches anything",
      description:
        "It reads the code and the generated architecture docs, recalls what it learned last time, writes a plan and asks when something is genuinely ambiguous.",
      plan: [
        "Read docs/kt: auth module, session lifecycle",
        "Trace token expiry in src/auth/session.ts",
        "Add refreshSession() with a 5-minute margin",
        "Cover expiry, refresh and logout with tests",
      ],
      question: "Should refresh failures sign the user out, or retry once?",
    },
    {
      visual: "work",
      number: "03",
      title: "It does the work — for real",
      description:
        "Real commands, real edits and a real browser, streamed into the conversation as they happen. Not a progress bar, not a simulation.",
      lines: [
        '$ rg -n "expiresAt" src/auth',
        "src/auth/session.ts:42: if (now > expiresAt) {",
        "edit  src/auth/session.ts  +38 −6",
        "edit  src/auth/session.test.ts  +71",
        "$ npm test -- auth",
        "Tests: 48 passed, 48 total",
      ],
    },
    {
      visual: "review",
      number: "04",
      title: "You review and ship",
      description:
        "Every change lands as a reviewable diff with the evidence attached. Nothing merges itself — you approve, request changes or reject.",
      checks: ["Unit tests · 48 passed", "Type check · clean", "Lint · clean"],
      approve: "Approve & merge",
      request: "Request changes",
    },
  ],
};

export type PlatformVisual =
  | "agent"
  | "knowledge"
  | "agentops"
  | "automations"
  | "routing"
  | "anywhere";

export const PLATFORM = {
  eyebrow: "The platform",
  title: "Everything an engineering org needs to put agents to work.",
  subtitle:
    "Not a chatbot bolted onto an IDE. A governed workspace where agents investigate, build, test and report — and where you can see exactly what they did.",
  items: [
    {
      visual: "agent" as PlatformVisual,
      title: "An agent that finishes the job",
      description:
        "Terminal, file editor and browser in an isolated sandbox. Neo answers from your checked-out code with file and line references, and proves a test fails when the behaviour breaks.",
      tags: ["Bash", "File edits", "Browser", "Sub-agents"],
    },
    {
      visual: "knowledge" as PlatformVisual,
      title: "Knowledge that stays",
      description:
        "Architecture docs generated for every repository, plus a narrated, screencast-style tutorial that walks a new engineer through the real code.",
      tags: ["KT docs", "Watch KT"],
    },
    {
      visual: "agentops" as PlatformVisual,
      title: "AgentOps Control Tower",
      description:
        "Every run, tool call, token and dollar, live. Budgets that halt a run and approvals that block it — enforced server-side.",
      tags: ["Live spans", "Budgets", "Audit"],
    },
    {
      visual: "automations" as PlatformVisual,
      title: "Automations that report back",
      description:
        "Schedules, GitHub events and webhooks. Neo opens the PR, then ends every run with a result you can verify.",
      tags: ["Cron", "GitHub", "Webhooks"],
    },
    {
      visual: "routing" as PlatformVisual,
      title: "Auto model routing",
      description:
        "Picks the right model for each request, downshifts on budget and fails over when a provider has a bad day.",
      tags: ["Auto", "Fallback"],
    },
    {
      visual: "anywhere" as PlatformVisual,
      title: "Runs where you need it",
      description:
        "In the browser, as a Mac or Windows app, or self-hosted inside your VPC with your own models.",
      tags: ["Web", "macOS", "Windows", "VPC"],
    },
  ],
  agentLines: [
    'rg -n "retryPolicy" src/',
    "view src/payments/retry.ts:40-88",
    "edit src/payments/retry.ts",
    "npm test -- payments",
  ],
  kt: ["Overview", "Checkout flow", "Auth & sessions", "Data model"],
  ktVideo: "Watch KT · 11 min",
  opsRuns: [
    { name: "Nightly dependency bump", cost: "$0.42", state: "done" },
    { name: "Fix CI on main", cost: "$0.17", state: "running" },
    { name: "Refactor billing client", cost: "$1.90", state: "approval" },
  ],
  opsStates: { done: "Done", running: "Running", approval: "Needs approval" },
  automationTrigger: "On workflow_run.failure",
  automationResult: "RESULT: https://github.com/acme/web/pull/913",
  routingModels: ["Fast", "Balanced", "Frontier"],
  routingLabel: "Auto",
  anywhere: ["Web", "Mac", "Windows", "Your VPC"],
};

export const STUDIOS = {
  eyebrow: "Studios",
  title: "Whole jobs, not just prompts.",
  subtitle:
    "Purpose-built studios for the work that eats quarters. Chat on the left, a live workbench on the right, and checks Neo cannot talk its way past.",
  hint: "Scroll",
  items: [
    {
      name: "Neo ME",
      kicker: "Application modernization",
      description:
        "Understand, interview, specify, characterize, migrate, verify. Parity is measured by replaying both apps side by side — not claimed by the agent.",
      stats: ["Replay parity", "Store parity", "Checkpoints"],
      accent: "#0b81b7",
    },
    {
      name: "Neo Synth",
      kicker: "Synthetic data",
      description:
        "Realistic, validated datasets from your schema, a sample export or a requirements document. Personal data is detected per column and you decide how it is treated.",
      stats: [
        "Postgres · MySQL · Oracle",
        "PII catalog",
        "Same seed, same bytes",
      ],
      accent: "#0e9f8e",
    },
    {
      name: "Environment Setup",
      kicker: "Onboarding agent",
      description:
        "Learns your stack and delivery process, connects Jira, GitLab, Slack and private hosts, and verifies every credential before it calls a step done.",
      stats: ["Verified connections", "Private networks", "Org memory"],
      accent: "#5b6cf0",
    },
    {
      name: "Knowledge",
      kicker: "KT for every repo",
      description:
        "A DeepWiki-style map of each codebase with diagrams, and Watch KT: a narrated walkthrough of the real files that a new hire can actually sit through.",
      stats: ["Architecture pages", "Mermaid diagrams", "Narrated video"],
      accent: "#d9480f",
    },
  ],
};

export const ZOOM = {
  lead: "Nothing merges",
  tail: "without you.",
  caption:
    "Every command is gated, every edit is logged, every change lands as a diff you approve.",
};

export const TRUST = {
  eyebrow: "Trust & safety",
  items: [
    {
      title: "Policy guardrails",
      description:
        "Confirmation modes, budgets per run and per agent, and approvals that block the runtime until a person answers.",
    },
    {
      title: "Isolated sandboxes",
      description:
        "Each session runs in its own workspace. Generated docs and data stay out of your commits.",
    },
    {
      title: "A full audit trail",
      description:
        "Every read, edit, command and decision is recorded with timestamps and cost — and never the model's private reasoning.",
    },
    {
      title: "Your perimeter",
      description:
        "Deploy in your cloud or VPC. Secrets are scanned out of everything an agent records.",
    },
  ],
};

export const STATS = {
  eyebrow: "Measured, not claimed",
  title: "Numbers from our published benchmarks.",
  items: [
    {
      value: 98,
      suffix: "%",
      prefix: "",
      decimals: 0,
      label: "answer accuracy on real code questions",
      detail: "Blind-judged explain tasks on flask, hono and ky.",
    },
    {
      value: 18,
      suffix: "/18",
      prefix: "",
      decimals: 0,
      label: "generated tests catch the planted bug",
      detail:
        "Graded by mutation: a test that passes on broken code scores zero.",
    },
    {
      value: 0.21,
      suffix: "",
      prefix: "$",
      decimals: 2,
      label: "average model cost per task",
      detail: "Same task set, enterprise frontier model.",
    },
    {
      value: 37,
      suffix: "%",
      prefix: "",
      decimals: 0,
      label: "fewer tokens per task",
      detail: "From Neo's terse working style, with no loss in accuracy.",
    },
  ],
  footnote:
    "Measured on Gemini 4 Argon in Neo's chat and token case studies, October 2026.",
};

export const CTA_BAND = {
  title: "Onboard your first digital engineer today.",
  subtitle:
    "Open the console, hand it a repo or a ticket and watch it work — governed, audited and ready to ship.",
  cta: "Try Neo",
  secondary: "See how it works",
};

export const FOOTER = {
  wordmark: "Neo",
  tagline: "An autonomous AI engineer for enterprise engineering teams.",
  columns: [
    {
      title: "Product",
      links: [
        { href: "#platform", label: "Platform" },
        { href: "#studios", label: "Studios" },
        { href: "#how", label: "How it works" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "#trust", label: "Trust & safety" },
        { href: "/login", label: "Sign in" },
      ],
    },
  ],
  copyright: "© 2026 NeoDevEx",
};
