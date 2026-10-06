import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, GraduationCap, Sparkles, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { BUBBLE_PALETTES } from "./tutorial-bubble";

export const TUTORIAL_LAUNCH_MENU_TEST_ID = "tutorial-launch-menu";

const SUGGESTIONS = [
  I18nKey.AI_GUIDE$SUGGESTION_AUTOMATION,
  I18nKey.AI_GUIDE$SUGGESTION_GITHUB,
  I18nKey.AI_GUIDE$SUGGESTION_BUDGET,
] as const;

const palette = BUBBLE_PALETTES.light;

/**
 * What the left-edge tutorial button opens: ask Neo for a step-by-step AI
 * guide to any goal (typed, or one of a few suggestions), or take the fixed
 * product tour. Styled with the tour bubble's light palette so both read as
 * one feature.
 */
export function TutorialLaunchMenu({
  onAsk,
  onProductTour,
  onClose,
}: {
  onAsk: (query: string, source: "suggestion" | "typed") => void;
  onProductTour: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("openhands");
  const [query, setQuery] = React.useState("");
  const menuRef = React.useRef<HTMLDivElement>(null);
  const inputId = React.useId();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || menuRef.current?.contains(target)) return;
      // The launcher toggles the menu itself.
      if (
        target instanceof Element &&
        target.closest('[data-testid="tutorial-launcher"]')
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onAsk(trimmed, "typed");
  };

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${inputId}-title`}
      data-testid={TUTORIAL_LAUNCH_MENU_TEST_ID}
      className={cn(
        "fixed left-9 top-16 z-[60] w-[min(calc(100vw-48px),340px)] rounded-2xl border px-5 py-4 md:top-1/2 md:-translate-y-1/2",
        "animate-[tutorial-launch-menu-in_200ms_ease-out] motion-reduce:animate-none",
        palette.card,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id={`${inputId}-title`}
            className="flex items-center gap-1.5 text-base font-semibold"
          >
            <Sparkles
              width={16}
              height={16}
              aria-hidden="true"
              className={palette.progress}
            />
            {t(I18nKey.AI_GUIDE$MENU_TITLE)}
          </h2>
          <p className={cn("mt-1 text-sm", palette.subtitle)}>
            {t(I18nKey.AI_GUIDE$MENU_SUBTITLE)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t(I18nKey.AI_GUIDE$CLOSE_MENU)}
          className={cn("rounded-md p-1", palette.muted)}
        >
          <X width={14} height={14} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t(I18nKey.AI_GUIDE$INPUT_LABEL)}
        </label>
        <input
          id={inputId}
          data-testid="ai-guide-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t(I18nKey.AI_GUIDE$INPUT_PLACEHOLDER)}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the user just opened this menu to type here.
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-[#d4e4f3] bg-[#ffffff] px-3 py-2 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#0b81b7] focus:outline-none"
        />
        <button
          type="submit"
          data-testid="ai-guide-submit"
          disabled={!query.trim()}
          aria-label={t(I18nKey.AI_GUIDE$SUBMIT)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50",
            palette.primary,
          )}
        >
          {t(I18nKey.AI_GUIDE$SUBMIT)}
          <ArrowRight width={14} height={14} aria-hidden="true" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((key) => (
          <button
            key={key}
            type="button"
            data-testid="ai-guide-suggestion"
            onClick={() => onAsk(t(key), "suggestion")}
            className="rounded-full border border-[#d4e4f3] bg-[#ffffff] px-3 py-1 text-xs text-[#334155] hover:border-[#0b81b7] hover:text-[#0b81b7]"
          >
            {t(key)}
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-[#d4e4f3] pt-3">
        <button
          type="button"
          data-testid="tutorial-launch-product-tour"
          onClick={onProductTour}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm",
            palette.ghost,
          )}
        >
          <GraduationCap width={14} height={14} aria-hidden="true" />
          {t(I18nKey.AI_GUIDE$PRODUCT_TOUR)}
        </button>
      </div>
    </div>
  );
}
