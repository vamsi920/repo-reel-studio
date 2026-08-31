import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  readinessAccent,
  readinessHeadlineKey,
} from "#/lib/environment/display";

const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface ReadinessRingProps {
  score: number;
  blockingCount: number;
}

/**
 * The headline number. Animates the arc on mount, and holds still for anyone
 * who has asked their system not to animate -- the number is the information,
 * the sweep is decoration.
 */
export function ReadinessRing({ score, blockingCount }: ReadinessRingProps) {
  const { t } = useTranslation("openhands");
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const accent = readinessAccent(clamped, blockingCount);
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div
      data-testid="readiness-ring"
      data-score={clamped}
      className="flex items-center gap-5"
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${clamped}%`}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--border-color)"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            // Rotated so the arc starts at twelve o'clock rather than three.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            initial={{
              strokeDashoffset: reduceMotion ? offset : CIRCUMFERENCE,
            }}
            animate={{ strokeDashoffset: offset }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
            }
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-[var(--text-primary)]">
            {clamped}
          </span>
          <span className="ame-eyebrow">
            {t(I18nKey.ENVIRONMENT$READINESS_EYEBROW)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {t(readinessHeadlineKey(clamped, blockingCount))}
        </h2>
        <p className="max-w-[38ch] text-sm text-[var(--text-secondary)]">
          {t(I18nKey.ENVIRONMENT$READINESS_SUBTITLE)}
        </p>
      </div>
    </div>
  );
}
