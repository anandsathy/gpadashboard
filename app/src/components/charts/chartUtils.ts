/**
 * Chart maths.
 *
 * Everything the charts need and nothing else — no plotting library, which
 * keeps the bundle small and, more usefully, means every line and fill is
 * styled by the same green tokens as the rest of the app rather than fought
 * with theme overrides.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;

  const scale = ((value: number) => {
    if (span === 0) return (r0 + r1) / 2;
    return r0 + ((value - d0) / span) * (r1 - r0);
  }) as Scale;

  scale.domain = domain;
  scale.range = range;
  return scale;
}

/**
 * Axis ticks a human would have chosen: steps of 1, 2, 2.5, or 5 times a power
 * of ten, covering the domain without crowding it.
 */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];

  const rawStep = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;

  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  // The epsilon keeps a tick that lands exactly on `max` from being dropped by
  // floating-point drift.
  for (let v = start; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

/** Pads a domain so the line never runs along the frame. */
export function padDomain(
  min: number,
  max: number,
  padding = 0.12,
  bounds?: { min?: number; max?: number },
): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];

  if (min === max) {
    const nudge = Math.abs(min) * 0.1 || 0.5;
    return [
      Math.max(bounds?.min ?? -Infinity, min - nudge),
      Math.min(bounds?.max ?? Infinity, max + nudge),
    ];
  }

  const pad = (max - min) * padding;
  return [
    Math.max(bounds?.min ?? -Infinity, min - pad),
    Math.min(bounds?.max ?? Infinity, max + pad),
  ];
}

/* -------------------------------------------------------------------------- */
/* Paths                                                                       */
/* -------------------------------------------------------------------------- */

export function linePath(points: Point[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
    .join(" ");
}

/**
 * Monotone cubic interpolation.
 *
 * A plain Catmull-Rom curve overshoots between points, which on a GPA chart
 * would draw a dip below a term the student never actually had. Fritsch-Carlson
 * filtering guarantees the curve stays within the data — the curve is prettier
 * *and* it cannot lie.
 */
export function smoothPath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${round(points[0]!.x)} ${round(points[0]!.y)}`;
  if (n === 2) return linePath(points);

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const h = b.x - a.x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (b.y - a.y) / h);
  }

  // Tangents: average of neighbouring slopes, zeroed at every local extremum.
  const m: number[] = new Array(n).fill(0);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const prev = slope[i - 1]!;
    const next = slope[i]!;
    m[i] = prev * next <= 0 ? 0 : (prev + next) / 2;
  }

  // Fritsch-Carlson: clamp tangents so no segment can overshoot.
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i]!;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / s;
    const b = m[i + 1]! / s;
    const magnitude = Math.hypot(a, b);
    if (magnitude > 3) {
      const t = 3 / magnitude;
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }

  let d = `M${round(points[0]!.x)} ${round(points[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const h = dx[i]! / 3;
    d +=
      ` C${round(a.x + h)} ${round(a.y + m[i]! * h)}` +
      ` ${round(b.x - h)} ${round(b.y - m[i + 1]! * h)}` +
      ` ${round(b.x)} ${round(b.y)}`;
  }
  return d;
}

/** Closes a line into a filled area down to `baseline`. */
export function areaPath(points: Point[], baseline: number, smooth = true): string {
  if (points.length === 0) return "";
  const top = smooth ? smoothPath(points) : linePath(points);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${top} L${round(last.x)} ${round(baseline)} L${round(first.x)} ${round(baseline)} Z`;
}

/** An SVG arc, used by the radial gauge. Angles in degrees, 0 at 12 o'clock. */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const sweep = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const direction = endAngle > startAngle ? 1 : 0;
  return `M${round(start.x)} ${round(start.y)} A${radius} ${radius} 0 ${sweep} ${direction} ${round(end.x)} ${round(end.y)}`;
}

export function polar(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/** Trims coordinate noise out of the emitted path data. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Total length of a polyline — used to time the line-drawing animation. */
export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  // Curves run a little longer than the straight-line distance between points.
  return Math.max(1, total * 1.15);
}

/** Index of the point nearest an x position — the crosshair's job. */
export function nearestIndex(points: Point[], x: number): number {
  if (points.length === 0) return -1;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const distance = Math.abs(points[i]!.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
