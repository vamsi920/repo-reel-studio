/**
 * NeoDevEx modification.
 *
 * Upstream's node components call `useI18n()` from
 * `dashboard/src/contexts/I18nContext.tsx`, which loads one of seven bundled
 * locale objects. NeoDevEx already has its own i18n stack (react-i18next), so
 * vendoring upstream's locales would mean two translation systems in one app.
 *
 * This shim keeps the vendored components byte-compatible by exposing the same
 * `useI18n()` signature, returning only the handful of strings those components
 * actually read. Everything user-facing that NeoDevEx renders itself goes
 * through react-i18next as usual.
 */

const STRINGS = {
  customNode: {
    tested: "Tested",
    hasTests: "This component has tests",
  },
};

export function useI18n(): { t: typeof STRINGS } {
  return { t: STRINGS };
}
