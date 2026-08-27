import { useId } from "react";

import { cx } from "@/components/ui/primitives";
import { arcPath, polar } from "./chartUtils";

/**
 * Radial progress toward the target GPA.
 *
 * A 240° sweep, forest green filling toward gold as it approaches the goal —
 * the "filling toward white/gold at goal" the brief asks for, done as a
 * gradient so the transition reads as arrival rather than as an alert.
 */

const START_ANGLE = -120;
const END_ANGLE = 120;
const SWEEP = END_ANGLE - START_ANGLE;

export interface GaugeProps {
  /** 0 to 1. */
  value: number;
  size?: number;
  thickness?: number;
  /** Big number in the middle. */
  label: string;
  /** Small line beneath it. */
  caption?: string;
  /** Draws the arc in gold when the target is out of reach. */
  tone?: "brand" | "warn";
  className?: string;
}

export function Gauge({
  value,
  size = 168,
  thickness = 13,
  label,
  caption,
  tone = "brand",
  className,
}: GaugeProps) {
  const gradientId = useId();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  const cx0 = size / 2;
  const cy0 = size / 2;
  const radius = (size - thickness) / 2 - 2;
  const endAngle = START_ANGLE + SWEEP * clamped;
  const knob = polar(cx0, cy0, radius, endAngle);

  return (
    <div className={cx("relative inline-grid place-items-center", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${Math.round(clamped * 100)} percent of the way to the target`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            {tone === "warn" ? (
              <>
                <stop offset="0%" stopColor="var(--warn)" stopOpacity="0.75" />
                <stop offset="100%" stopColor="var(--warn)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="var(--brand-solid)" />
                <stop offset="62%" stopColor="var(--brand-2)" />
                {/* The last stretch warms toward gold — the goal, arriving. */}
                <stop offset="100%" stopColor="var(--warn)" />
              </>
            )}
          </linearGradient>
        </defs>

        {/* Track */}
        <path
          d={arcPath(cx0, cy0, radius, START_ANGLE, END_ANGLE)}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={thickness}
          strokeLinecap="round"
        />

        {/* Progress */}
        {clamped > 0.001 ? (
          <path
            d={arcPath(cx0, cy0, radius, START_ANGLE, endAngle)}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={thickness}
            strokeLinecap="round"
            style={{ transition: "d 0.7s cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        ) : null}

        {/* Knob */}
        {clamped > 0.001 ? (
          <circle
            cx={knob.x}
            cy={knob.y}
            r={thickness / 2 - 2.5}
            fill="var(--surface)"
            stroke={tone === "warn" ? "var(--warn)" : "var(--brand)"}
            strokeWidth="2.5"
          />
        ) : null}
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div
            className="tnum leading-none font-semibold"
            style={{ fontSize: size * 0.235, color: tone === "warn" ? "var(--warn)" : "var(--brand)" }}
          >
            {label}
          </div>
          {caption ? (
            <div className="mt-1.5 px-3 text-[11px] leading-tight font-semibold text-ink-3">
              {caption}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
