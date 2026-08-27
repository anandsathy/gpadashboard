import { useCallback, useId, useMemo, useRef, useState } from "react";

import { formatGpa } from "@/lib/format";
import type { TrendPoint } from "@/lib/types";
import { cx } from "@/components/ui/primitives";
import {
  areaPath,
  linearScale,
  nearestIndex,
  niceTicks,
  padDomain,
  pathLength,
  smoothPath,
  type Point,
} from "./chartUtils";

/**
 * The GPA trend chart.
 *
 * Forest green line, light green fill beneath it, a lighter second line for the
 * unweighted series, and a dashed gold rule at the target. It is a plain
 * viewBox SVG, so it scales to any container without a resize observer, and it
 * reads pointer position rather than relying on per-point hit areas — which is
 * what makes the crosshair work on a phone.
 */

export type TrendSeries = "cumulative" | "term";

export interface TrendChartProps {
  points: TrendPoint[];
  /** Cumulative GPA over time, or each term on its own. */
  series?: TrendSeries;
  showUnweighted?: boolean;
  target?: number | null;
  precision?: 2 | 3;
  height?: number;
  className?: string;
  /** Disables the entry animation — used when the chart re-renders constantly. */
  still?: boolean;
}

const PAD = { top: 16, right: 18, bottom: 30, left: 40 };
const VIEW_W = 760;

export function TrendChart({
  points,
  series = "cumulative",
  showUnweighted = true,
  target = null,
  precision = 2,
  height = 260,
  className,
  still = false,
}: TrendChartProps) {
  const gradientId = useId();
  const clipId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const readWeighted = useCallback(
    (p: TrendPoint) => (series === "cumulative" ? p.cumulativeWeighted : p.weighted),
    [series],
  );
  const readUnweighted = useCallback(
    (p: TrendPoint) => (series === "cumulative" ? p.cumulativeUnweighted : p.unweighted),
    [series],
  );

  const chart = useMemo(() => {
    const usable = points.filter((p) => readWeighted(p) !== null);
    if (usable.length === 0) return null;

    const values: number[] = [];
    for (const p of usable) {
      const w = readWeighted(p);
      const u = readUnweighted(p);
      if (w !== null) values.push(w);
      if (showUnweighted && u !== null) values.push(u);
    }
    if (target !== null && Number.isFinite(target)) values.push(target);

    const [lo, hi] = padDomain(Math.min(...values), Math.max(...values), 0.16, { min: 0 });

    const innerW = VIEW_W - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;

    const x = linearScale([0, Math.max(1, usable.length - 1)], [PAD.left, PAD.left + innerW]);
    const y = linearScale([lo, hi], [PAD.top + innerH, PAD.top]);

    const toPoints = (read: (p: TrendPoint) => number | null): Point[] =>
      usable
        .map((p, i) => {
          const value = read(p);
          return value === null ? null : { x: x(i), y: y(value) };
        })
        .filter((p): p is Point => p !== null);

    const weightedPoints = toPoints(readWeighted);
    const unweightedPoints = showUnweighted ? toPoints(readUnweighted) : [];

    return {
      usable,
      x,
      y,
      innerH,
      baseline: PAD.top + innerH,
      weightedPoints,
      unweightedPoints,
      ticks: niceTicks(lo, hi, 4),
    };
  }, [points, readWeighted, readUnweighted, showUnweighted, target, height]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || !chart) return;
      const rect = svg.getBoundingClientRect();
      // The SVG scales to its container, so pointer x has to be mapped back
      // into viewBox units before it means anything.
      const localX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
      setHover(nearestIndex(chart.weightedPoints, localX));
    },
    [chart],
  );

  if (!chart) {
    return (
      <div
        className={cx(
          "flex items-center justify-center rounded-[10px] border border-dashed border-line-strong text-[13px] text-ink-3",
          className,
        )}
        style={{ height }}
      >
        Grades from two terms draw a trend line here.
      </div>
    );
  }

  const { usable, x, y, baseline, weightedPoints, unweightedPoints, ticks } = chart;
  const active = hover !== null && hover >= 0 && hover < usable.length ? hover : null;
  const activePoint = active !== null ? usable[active] : null;
  const drawLength = pathLength(weightedPoints);

  // Keep the tooltip inside the frame at both ends.
  const tipX = active !== null ? x(active) : 0;
  const tipAnchor = tipX > VIEW_W - 150 ? "end" : tipX < 150 ? "start" : "middle";
  const tipOffset = tipAnchor === "end" ? -10 : tipAnchor === "start" ? 10 : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      className={cx("block w-full touch-none select-none", className)}
      style={{ height }}
      role="img"
      aria-label={`GPA trend across ${usable.length} terms`}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-2)" stopOpacity="0.28" />
          <stop offset="55%" stopColor="var(--brand-2)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--brand-2)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x={PAD.left} y={0} width={VIEW_W - PAD.left - PAD.right} height={height} />
        </clipPath>
      </defs>

      {/* Horizontal grid + y axis labels */}
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={PAD.left - 8}
            y={y(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            className="tnum"
            fontSize="10.5"
            fill="var(--ink-3)"
          >
            {tick.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Target line */}
      {target !== null && Number.isFinite(target) ? (
        <g>
          <line
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={y(target)}
            y2={y(target)}
            stroke="var(--warn)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.85"
          />
          <text
            x={VIEW_W - PAD.right}
            y={y(target) - 5}
            textAnchor="end"
            fontSize="10"
            fontWeight="700"
            fill="var(--warn)"
          >
            TARGET {formatGpa(target, precision)}
          </text>
        </g>
      ) : null}

      <g clipPath={`url(#${clipId})`}>
        {/* Area beneath the weighted line */}
        <path d={areaPath(weightedPoints, baseline)} fill={`url(#${gradientId})`} />

        {/* Unweighted, quieter and behind */}
        {unweightedPoints.length > 1 ? (
          <path
            d={smoothPath(unweightedPoints)}
            fill="none"
            stroke="var(--brand-2)"
            strokeWidth="1.8"
            strokeDasharray="4 4"
            strokeLinecap="round"
            opacity="0.65"
          />
        ) : null}

        {/* Weighted — the primary line */}
        <path
          d={smoothPath(weightedPoints)}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={still ? undefined : "chart-line"}
          style={still ? undefined : ({ "--draw-length": drawLength } as React.CSSProperties)}
        />
      </g>

      {/* Crosshair */}
      {active !== null ? (
        <line
          x1={x(active)}
          x2={x(active)}
          y1={PAD.top}
          y2={baseline}
          stroke="var(--brand)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      ) : null}

      {/* Points */}
      {weightedPoints.map((point, i) => (
        <circle
          key={usable[i]?.key ?? i}
          cx={point.x}
          cy={point.y}
          r={active === i ? 5.5 : 3.5}
          fill="var(--surface)"
          stroke="var(--brand)"
          strokeWidth={active === i ? 3 : 2}
          className="transition-[r,stroke-width] duration-150"
        />
      ))}

      {/* X axis labels */}
      {usable.map((point, i) => (
        <text
          key={point.key}
          x={x(i)}
          y={height - 10}
          textAnchor="middle"
          fontSize="10.5"
          fontWeight={active === i ? 700 : 500}
          fill={active === i ? "var(--brand)" : "var(--ink-3)"}
        >
          {point.shortLabel}
        </text>
      ))}

      {/* Tooltip */}
      {activePoint ? (
        <g transform={`translate(${tipX + tipOffset}, ${PAD.top + 2})`} pointerEvents="none">
          <rect
            x={tipAnchor === "end" ? -166 : tipAnchor === "start" ? 0 : -83}
            y={0}
            width={166}
            height={showUnweighted ? 52 : 36}
            rx={9}
            fill="var(--surface)"
            stroke="var(--border-strong)"
            className="drop-shadow-sm"
          />
          <text
            x={tipAnchor === "end" ? -154 : tipAnchor === "start" ? 12 : -71}
            y={16}
            fontSize="10.5"
            fontWeight="700"
            fill="var(--ink-3)"
            letterSpacing="0.06em"
          >
            {activePoint.label.toUpperCase()}
          </text>
          <text
            x={tipAnchor === "end" ? -154 : tipAnchor === "start" ? 12 : -71}
            y={32}
            fontSize="12.5"
            fill="var(--ink)"
          >
            <tspan fontWeight="700" fill="var(--brand)" className="tnum">
              {formatGpa(readWeighted(activePoint), precision)}
            </tspan>
            <tspan fill="var(--ink-2)"> weighted</tspan>
          </text>
          {showUnweighted ? (
            <text
              x={tipAnchor === "end" ? -154 : tipAnchor === "start" ? 12 : -71}
              y={46}
              fontSize="11.5"
              fill="var(--ink-2)"
            >
              <tspan className="tnum" fontWeight="600">
                {formatGpa(readUnweighted(activePoint), precision)}
              </tspan>
              <tspan> unweighted</tspan>
            </text>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

/** The chart's key, rendered as HTML so it wraps properly on narrow screens. */
export function TrendLegend({ showUnweighted = true }: { showUnweighted?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] font-semibold text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="block h-[3px] w-4 rounded-full bg-brand" />
        Weighted
      </span>
      {showUnweighted ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="block h-[3px] w-4 rounded-full opacity-70"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--brand-2) 0 4px, transparent 4px 8px)",
            }}
          />
          Unweighted
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span
          className="block h-[3px] w-4 rounded-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--warn) 0 5px, transparent 5px 9px)",
          }}
        />
        Target
      </span>
    </div>
  );
}
