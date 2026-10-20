/**
 * Appearance: light / dark / follow-the-system.
 *
 * The app's palette is a single cool-grey ramp (`--cool-grey-50…975`) that
 * every `--oh-*` and design-system token resolves through, so dark mode is
 * the same ramp with its lightness order inverted, applied on the scope
 * roots (`[data-agent-server-ui]`) where those tokens are declared. The
 * rule is injected as a `<style>` at runtime, like `color-themes.ts`, so it
 * bypasses the build-time selector scoping and works for embedded hosts.
 *
 * HeroUI components switch through the `dark` / `light` class the root
 * wrapper already sets from its `theme` prop (see hero.ts).
 */

export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "openhands-appearance";
export const APPEARANCE_EVENT = "openhands-appearance-change";
export const APPEARANCE_ATTRIBUTE = "data-appearance";
export const APPEARANCE_MODES: readonly AppearanceMode[] = [
  "system",
  "light",
  "dark",
];
const STYLE_ID = "oh-appearance-dark";

/**
 * Neo's own look is the light theme (the Neo-DeepSea palette), so that is
 * what a new user sees whatever their OS is set to. Dark and "match system"
 * are opt-in from Settings ▸ App ▸ Appearance or the desktop View menu.
 */
export const DEFAULT_APPEARANCE: AppearanceMode = "light";

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return (
    typeof value === "string" && (APPEARANCE_MODES as string[]).includes(value)
  );
}

export function readPersistedAppearance(): AppearanceMode {
  try {
    const raw = globalThis.localStorage?.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearanceMode(raw) ? raw : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function persistAppearance(mode: AppearanceMode): void {
  try {
    globalThis.localStorage?.setItem(APPEARANCE_STORAGE_KEY, mode);
  } catch {
    // Private mode / blocked storage: the choice lasts for the session.
  }
  globalThis.dispatchEvent?.(new Event(APPEARANCE_EVENT));
}

/** Pure: which concrete appearance a mode yields given the OS preference. */
export function resolveAppearance(
  mode: AppearanceMode,
  prefersDark: boolean,
): ResolvedAppearance {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

export function systemPrefersDark(): boolean {
  try {
    return (
      globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
    );
  } catch {
    return false;
  }
}

export function currentAppearance(): ResolvedAppearance {
  return resolveAppearance(readPersistedAppearance(), systemPrefersDark());
}

/**
 * The dark ramp: index.css's light ramp with the lightness order inverted
 * back (50↔975, 100↔950, …). Declared on the scope roots so every
 * `--oh-*` token declared there resolves against it.
 */
export const DARK_COOL_GREY: Record<string, string> = {
  "50": "#F7F9FC",
  "100": "#EEF2F7",
  "200": "#DCE3EE",
  "300": "#C3CDDC",
  "400": "#A3B0C4",
  "500": "#7E8A9E",
  "600": "#626D82",
  "700": "#4B5468",
  "800": "#383F50",
  "900": "#2C313F",
  "925": "#21252F",
  "950": "#0B0E14",
  "975": "#05070A",
};

export function buildDarkAppearanceCss(): string {
  const ramp = Object.entries(DARK_COOL_GREY)
    .map(([stop, hex]) => `  --cool-grey-${stop}: ${hex};`)
    .join("\n");
  // Doubled attribute = specificity above the stylesheet's own single
  // attribute rules, the same trick color-themes.ts relies on.
  return `[data-agent-server-ui][${APPEARANCE_ATTRIBUTE}="dark"],
[data-agent-server-ui] [${APPEARANCE_ATTRIBUTE}="dark"][${APPEARANCE_ATTRIBUTE}="dark"] {
  color-scheme: dark;
${ramp}
  --oh-modal-title-foreground: #eef2f7;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.55);
  --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.6);
}
[${APPEARANCE_ATTRIBUTE}="dark"] img[src$=".svg"][data-invert-on-dark] { filter: invert(1); }
`;
}

/** Apply the resolved appearance to the DOM (idempotent). */
export function applyAppearance(resolved: ResolvedAppearance): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildDarkAppearanceCss();
    document.head.appendChild(style);
  }
  const roots = document.querySelectorAll<HTMLElement>(
    "[data-agent-server-ui]",
  );
  for (const root of roots) root.setAttribute(APPEARANCE_ATTRIBUTE, resolved);
  document.documentElement.setAttribute(APPEARANCE_ATTRIBUTE, resolved);
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Subscribe to appearance changes (user choice or OS preference) for
 * `useSyncExternalStore`. Returns the unsubscribe.
 */
export function subscribeAppearance(callback: () => void): () => void {
  const media = (() => {
    try {
      return globalThis.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    } catch {
      return null;
    }
  })();
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === APPEARANCE_STORAGE_KEY) callback();
  };
  globalThis.addEventListener?.(APPEARANCE_EVENT, callback);
  globalThis.addEventListener?.("storage", onStorage);
  media?.addEventListener?.("change", callback);
  return () => {
    globalThis.removeEventListener?.(APPEARANCE_EVENT, callback);
    globalThis.removeEventListener?.("storage", onStorage);
    media?.removeEventListener?.("change", callback);
  };
}
