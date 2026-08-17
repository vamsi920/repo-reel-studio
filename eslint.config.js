import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "server/.agent-runs/**",
      "server/.repo-workspaces/**",
      "server/.proactive-workspaces/**",
      "code-graph-rag-main/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // These modules intentionally colocate components with hooks, variants, or
    // navigation helpers as part of their public API. HMR remains functional;
    // only the single-component export convention does not apply to them.
    files: [
      "src/components/ui/**/*.{ts,tsx}",
      "src/components/auth/AuthGate.tsx",
      "src/components/journey/ProjectJourney.tsx",
      "src/components/studio/agent-ops/shared/AgentOpsActionButton.tsx",
      "src/context/AuthContext.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
