import type { Conversion } from "./types";

/**
 * Grade scales.
 *
 * Grades are stored as percentages, because that is what the school records and
 * what its weighting rule operates on: course points are added to the
 * *percentage* before anything is converted. Letters are a display convenience
 * and a convenient way to type a grade in.
 */

export interface Band {
  /** Lowest percentage that still earns this letter. */
  min: number;
  letter: string;
  /** Where the letter lands on the unweighted 4.0 scale. */
  points: number;
  /** A representative percentage, used when a letter is typed instead of a number. */
  nominal: number;
}

export const BANDS: readonly Band[] = [
  { min: 97, letter: "A+", points: 4.0, nominal: 98 },
  { min: 93, letter: "A", points: 4.0, nominal: 95 },
  { min: 90, letter: "A-", points: 3.7, nominal: 91 },
  { min: 87, letter: "B+", points: 3.3, nominal: 88 },
  { min: 83, letter: "B", points: 3.0, nominal: 85 },
  { min: 80, letter: "B-", points: 2.7, nominal: 81 },
  { min: 77, letter: "C+", points: 2.3, nominal: 78 },
  { min: 73, letter: "C", points: 2.0, nominal: 75 },
  { min: 70, letter: "C-", points: 1.7, nominal: 71 },
  { min: 67, letter: "D+", points: 1.3, nominal: 68 },
  { min: 63, letter: "D", points: 1.0, nominal: 65 },
  { min: 60, letter: "D-", points: 0.7, nominal: 61 },
  { min: 0, letter: "F", points: 0.0, nominal: 50 },
] as const;

/** The percentage at which a passing grade begins — the floor of the linear scale. */
export const PASSING_FLOOR = 60;

const LAST_BAND = BANDS[BANDS.length - 1] as Band;

export function bandFor(percent: number): Band {
  // Above 100 the top band still applies; the extra points are handled by the
  // conversion functions, which let a bumped grade climb past 4.0.
  return BANDS.find((b) => percent >= b.min) ?? LAST_BAND;
}

export function percentToLetter(percent: number): string {
  return bandFor(Math.min(percent, 100)).letter;
}

const LETTER_LOOKUP = new Map<string, Band>(BANDS.map((b) => [b.letter.toUpperCase(), b]));

/** "A-" -> 91. Returns null for anything that is not a letter grade. */
export function letterToPercent(input: string): number | null {
  const key = input.trim().toUpperCase().replace(/\s+/g, "");
  const band = LETTER_LOOKUP.get(key);
  return band ? band.nominal : null;
}

/**
 * Accepts whatever a student is likely to type: `92`, `92.5`, `92%`, `A-`, `a`.
 * Returns null when the input is empty or unparseable.
 */
export function parseGrade(input: string): number | null {
  const raw = input.trim();
  if (raw === "") return null;

  const letter = letterToPercent(raw);
  if (letter !== null) return letter;

  const numeric = Number(raw.replace(/%$/, "").trim());
  if (!Number.isFinite(numeric)) return null;

  // Nobody means -4 or 900. Clamp to a range that still leaves room for a
  // bumped grade to be entered directly.
  return clamp(numeric, 0, 150);
}

/**
 * Percentage to a point on the 4.0 scale.
 *
 * Both conversions deliberately continue above 4.0. That is the whole point of
 * the school's rule: an AP grade of 95 becomes 102 before conversion, and the
 * seven extra points have to show up somewhere. Capping at 4.0 would silently
 * erase the weighting.
 */
export function percentToGpa(percent: number, conversion: Conversion): number {
  if (percent <= 0) return 0;

  if (percent > 100) {
    // Above a perfect score, both scales agree: ten percentage points per
    // grade point, continuing the slope the linear scale uses throughout.
    return 4 + (percent - 100) / 10;
  }

  if (conversion === "bands") {
    return bandFor(percent).points;
  }

  // Linear: 60% is a 0.0, 100% is a 4.0, ten points to the grade point.
  return Math.max(0, (percent - PASSING_FLOOR) / 10);
}

/** The inverse of {@link percentToGpa} — used by the target solver. */
export function gpaToPercent(gpa: number, conversion: Conversion): number {
  if (gpa > 4) return 100 + (gpa - 4) * 10;

  if (conversion === "bands") {
    // Take the lowest percentage that still earns at least this many points.
    const band = [...BANDS].reverse().find((b) => b.points >= gpa);
    return band ? band.min : 100;
  }

  return gpa * 10 + PASSING_FLOOR;
}

export const percentToTen = (percent: number): number => percent / 10;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds without the floating-point surprises of `toFixed` round-half-even. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
