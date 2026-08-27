import { useId, useMemo } from "react";

import { formatGpa, trimZeros } from "@/lib/format";
import { cx } from "@/components/ui/primitives";
import { linearScale, smoothPath, type Point } from "./chartUtils";

/**
 * The small charts: a subject ranking, a credit-mix donut, and an inline
 * sparkline. Same rules as the big one — pure SVG, tokens for every color.
 */

/* -------------------------------------------------------------------------- */
/* Horizontal bars                                                             */
/* -------------------------------------------------------------------------- */

export interface BarDatum {
  label: string;
  value: number;
  /** Shown to the right of the bar; defaults to the value. */
  display?: string;
  meta?: string;
}

export function BarChart({
  data,
  max,
  precision = 2,
  className,
  emptyLabel = "Nothing graded yet.",
}: {
  data: BarDatum[];
  max?: number;
  precision?: 2 | 3;
  className?: string;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <p className={cx("py-6 text-center text-[13px] text-ink-3", className)}>{emptyLabel}</p>;
  }

  const ceiling = max ?? Math.max(...data.map((d) => d.value), 0.001);

  return (
    <ul className={cx("flex flex-col gap-2.5", className)}>
      {data.map((datum) => {
        const pct = Math.max(0, Math.min(100, (datum.value / ceiling) * 100));
        return (
          <li key={datum.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3">
            <span className="truncate text-[12.5px] font-semibold text-ink" title={datum.label}>
              {datum.label}
            </span>

            <span className="h-2.5 overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, var(--brand-solid), var(--brand-2))",
                }}
              />
            </span>

            <span className="tnum text-[12.5px] font-semibold text-ink-2">
              {datum.display ?? formatGpa(datum.value, precision)}
              {datum.meta ? (
                <span className="ml-1.5 font-sans text-[11px] font-medium text-ink-3">
                  {datum.meta}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Donut                                                                       */
/* -------------------------------------------------------------------------- */

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  size = 128,
  thickness = 18,
  centerLabel,
  centerCaption,
  className,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerCaption?: string;
  className?: string;
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Each slice is drawn as a dash on a single circle: one arc, no path maths.
  let consumed = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const fraction = total > 0 ? slice.value / total : 0;
      const dash = fraction * circumference;
      const arc = {
        ...slice,
        dasharray: `${dash} ${circumference - dash}`,
        dashoffset: -consumed * circumference,
      };
      consumed += fraction;
      return arc;
    });

  return (
    <div className={cx("relative inline-grid place-items-center", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Credit mix">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={thickness}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={thickness}
              strokeDasharray={arc.dasharray}
              strokeDashoffset={arc.dashoffset}
              strokeLinecap="butt"
            />
          ))}
        </g>
      </svg>

      {centerLabel ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="tnum text-[19px] leading-none font-semibold text-ink">{centerLabel}</div>
            {centerCaption ? (
              <div className="mt-1 text-[10px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                {centerCaption}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DonutLegend({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  return (
    <ul className="flex flex-col gap-1.5">
      {slices.map((slice) => (
        <li key={slice.label} className="flex items-center gap-2 text-[12.5px]">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ background: slice.color }}
            aria-hidden="true"
          />
          <span className="flex-1 truncate font-semibold text-ink-2">{slice.label}</span>
          <span className="tnum font-semibold text-ink">{trimZeros(slice.value.toFixed(2))}</span>
          <span className="w-9 text-right text-[11px] font-medium text-ink-3">
            {total > 0 ? `${Math.round((slice.value / total) * 100)}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                   */
/* -------------------------------------------------------------------------- */

export function Sparkline({
  values,
  width = 92,
  height = 26,
  className,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();

  const path = useMemo(() => {
    const usable = values.filter((v): v is number => v !== null && Number.isFinite(v));
    if (usable.length < 2) return null;

    const lo = Math.min(...usable);
    const hi = Math.max(...usable);
    const x = linearScale([0, usable.length - 1], [1.5, width - 1.5]);
    const y = linearScale(lo === hi ? [lo - 0.5, hi + 0.5] : [lo, hi], [height - 2.5, 2.5]);

    const points: Point[] = usable.map((value, i) => ({ x: x(i), y: y(value) }));
    return {
      line: smoothPath(points),
      last: points[points.length - 1] as Point,
      rising: (usable[usable.length - 1] as number) >= (usable[0] as number),
    };
  }, [values, width, height]);

  if (!path) return null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand-2)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand)" />
        </linearGradient>
      </defs>
      <path
        d={path.line}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={path.last.x}
        cy={path.last.y}
        r="2.4"
        fill={path.rising ? "var(--brand)" : "var(--warn)"}
      />
    </svg>
  );
}
