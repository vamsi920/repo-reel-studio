import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { extensionModuleCardPillClassName } from "#/utils/extension-module-card-classes";

const PILL_GAP_PX = 6;
const OVERFLOW_PILL_WIDTH_PX = 40;

export interface SkillCardPill {
  id: string;
  node: React.ReactNode;
  /**
   * Plain-text form of `node`, shown in the overflow badge's tooltip. `node`
   * is an arbitrary ReactNode (icons, nested spans) so it cannot be read back
   * out as text; producers that skip this lose only the tooltip, never a
   * crash — `id` (a stable key, not user-facing copy) is never used as a
   * stand-in.
   */
  label?: string;
}

export function computeVisiblePillCount(
  widths: number[],
  containerWidth: number,
): number {
  if (widths.length === 0 || containerWidth <= 0) return 0;

  const totalWidth = widths.reduce(
    (sum, width, i) => sum + width + (i > 0 ? PILL_GAP_PX : 0),
    0,
  );
  // Every pill fits with no overflow badge needed at all — the most common
  // case, and one the reservation loop below must never shrink further.
  if (totalWidth <= containerWidth) return widths.length;

  // From here an overflow badge is unavoidable, so its width is reserved for
  // every remaining pill (including the last one), not just "pills after
  // this one" — reserving conditionally on `remaining > 0` previously let the
  // second-to-last pill skip the reservation even though the badge still had
  // to be rendered, hiding pills that would otherwise have fit.
  const reserve = OVERFLOW_PILL_WIDTH_PX + PILL_GAP_PX;
  let used = 0;
  for (let i = 0; i < widths.length; i += 1) {
    const width = widths[i]!;
    const gap = i > 0 ? PILL_GAP_PX : 0;
    if (used + gap + width + reserve > containerWidth) {
      return Math.max(1, i);
    }
    used += gap + width;
  }
  return widths.length;
}

interface SkillCardPillRowProps {
  pills: SkillCardPill[];
  testId: string;
}

export function SkillCardPillRow({ pills, testId }: SkillCardPillRowProps) {
  const { t } = useTranslation("openhands");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(pills.length);

  const recomputeVisibleCount = React.useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const widths = Array.from(measure.children).map(
      (child) => (child as HTMLElement).offsetWidth,
    );
    setVisibleCount(computeVisiblePillCount(widths, container.clientWidth));
  }, []);

  React.useLayoutEffect(() => {
    recomputeVisibleCount();
  }, [pills, recomputeVisibleCount]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => recomputeVisibleCount());
    observer.observe(container);
    return () => observer.disconnect();
  }, [recomputeVisibleCount]);

  if (pills.length === 0) return null;

  const hiddenCount = Math.max(0, pills.length - visibleCount);
  const hiddenLabels = pills
    .slice(visibleCount)
    .map((pill) => pill.label)
    .filter((label): label is string => !!label);

  return (
    <div className="min-w-0 overflow-hidden">
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none fixed top-0 -left-[10000px] z-[-1] flex flex-nowrap items-center gap-1.5 opacity-0"
      >
        {pills.map((pill) => (
          <span key={pill.id} className="inline-flex shrink-0">
            {pill.node}
          </span>
        ))}
      </div>
      <div
        ref={containerRef}
        data-testid={testId}
        className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-hidden"
      >
        {pills.slice(0, visibleCount).map((pill) => (
          <span key={pill.id} className="inline-flex shrink-0">
            {pill.node}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span
            data-testid={`${testId}-overflow`}
            className={cn(
              extensionModuleCardPillClassName,
              "font-medium text-tertiary-alt",
            )}
            title={
              hiddenLabels.length > 0 ? hiddenLabels.join(", ") : undefined
            }
          >
            {t(I18nKey.SETTINGS$SKILLS_PILLS_MORE, { count: hiddenCount })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
