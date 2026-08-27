import {
  clamp,
  gpaToPercent,
  percentToGpa,
  percentToTen,
  round,
} from "./scale";
import {
  GRADE_LEVELS,
  TERMS,
  type Course,
  type Difficulty,
  type GradeLevel,
  type Reading,
  type Settings,
  type Summary,
  type Term,
  type TermSummary,
  type TrendPoint,
  type YearSummary,
} from "./types";

/**
 * The GPA engine.
 *
 * Every function here is pure: courses and settings in, numbers out. No React,
 * no storage, no dates. That is what makes the whole thing testable, and
 * `gpa.test.ts` leans on it hard.
 */

/* -------------------------------------------------------------------------- */
/* Reading a single course                                                     */
/* -------------------------------------------------------------------------- */

/** A course counts toward the real GPA once it has a recorded grade. */
export const isGraded = (course: Course): boolean =>
  course.percent !== null && Number.isFinite(course.percent);

/** A course that is only carrying a hypothetical grade. */
export const isProjectedOnly = (course: Course): boolean =>
  !isGraded(course) && course.projected !== null && Number.isFinite(course.projected);

/**
 * The grade a calculation should actually use.
 *
 * With simulation off this is the recorded grade and nothing else — the whole
 * promise of the Simulate view is that it cannot touch real totals. With
 * simulation on, a projected grade both fills in a blank *and* overrides a
 * recorded one, so "what if I pull this B up to an A" works.
 */
export function effectiveGrade(course: Course, simulate: boolean): number | null {
  if (simulate && course.projected !== null && Number.isFinite(course.projected)) {
    return course.projected;
  }
  return isGraded(course) ? course.percent : null;
}

/** Percentage points this course's difficulty adds before conversion. */
export function bumpFor(difficulty: Difficulty, settings: Settings): number {
  return settings.bumps[difficulty] ?? 0;
}

/** The grade after weighting — what the school converts to a GPA. */
export function weightedPercent(
  course: Course,
  settings: Settings,
  simulate: boolean,
): number | null {
  const base = effectiveGrade(course, simulate);
  return base === null ? null : base + bumpFor(course.difficulty, settings);
}

export function courseGpa(
  course: Course,
  settings: Settings,
  weighted: boolean,
  simulate: boolean,
): number | null {
  const pct = weighted ? weightedPercent(course, settings, simulate) : effectiveGrade(course, simulate);
  return pct === null ? null : percentToGpa(pct, settings.conversion);
}

/* -------------------------------------------------------------------------- */
/* Averaging                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Credit-weighted average across a set of courses.
 *
 * `per-course` averaging converts every course to points first and then
 * averages — the ordinary transcript arithmetic, and what "add points to the
 * grade before converting to the GPA scale" describes. `aggregate` averages the
 * percentages first and converts once, which is how some schools publish a
 * single course-point average. Both are offered because they disagree, and a
 * student should be able to match whatever their transcript says.
 */
export function reading(
  courses: readonly Course[],
  settings: Settings,
  weighted: boolean,
  simulate: boolean,
): Reading | null {
  let credits = 0;
  let percentSum = 0;
  let gpaSum = 0;

  for (const course of courses) {
    if (!(course.credits > 0)) continue;
    const base = effectiveGrade(course, simulate);
    if (base === null) continue;

    const pct = weighted ? base + bumpFor(course.difficulty, settings) : base;
    credits += course.credits;
    percentSum += pct * course.credits;
    gpaSum += percentToGpa(pct, settings.conversion) * course.credits;
  }

  if (credits <= 0) return null;

  const avgPercent = percentSum / credits;
  const gpa =
    settings.averaging === "per-course"
      ? gpaSum / credits
      : percentToGpa(avgPercent, settings.conversion);

  return {
    percent: avgPercent,
    gpa,
    ten: percentToTen(avgPercent),
    credits,
  };
}

export function summarize(
  courses: readonly Course[],
  settings: Settings,
  simulate: boolean,
): Summary {
  let gradedCount = 0;
  let ungradedCount = 0;
  let openCredits = 0;

  for (const course of courses) {
    if (effectiveGrade(course, simulate) !== null) {
      gradedCount += 1;
    } else {
      ungradedCount += 1;
      openCredits += course.credits > 0 ? course.credits : 0;
    }
  }

  return {
    weighted: reading(courses, settings, true, simulate),
    unweighted: reading(courses, settings, false, simulate),
    gradedCount,
    ungradedCount,
    openCredits: round(openCredits, 2),
  };
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                    */
/* -------------------------------------------------------------------------- */

export const termKey = (gradeLevel: GradeLevel, term: Term): string => `${gradeLevel}-${term}`;

export const termOrder = (gradeLevel: GradeLevel, term: Term): number =>
  gradeLevel * 2 + (term === "S1" ? 0 : 1);

export const GRADE_NAMES: Record<GradeLevel, string> = {
  9: "Freshman",
  10: "Sophomore",
  11: "Junior",
  12: "Senior",
};

export const termName = (term: Term): string => (term === "S1" ? "Fall" : "Spring");

/** `9` with a 2028 graduation -> "2024–25". */
export function academicYear(gradeLevel: GradeLevel, graduationYear: number): string {
  const spring = graduationYear - (12 - gradeLevel);
  const fall = spring - 1;
  return `${fall}–${String(spring).slice(2)}`;
}

export function termLabel(gradeLevel: GradeLevel, term: Term): string {
  return `${GRADE_NAMES[gradeLevel]} · ${termName(term)}`;
}

export function shortTermLabel(gradeLevel: GradeLevel, term: Term): string {
  return `${gradeLevel}·${term === "S1" ? "F" : "S"}`;
}

export function sortCourses(courses: readonly Course[]): Course[] {
  return [...courses].sort(
    (a, b) =>
      termOrder(a.gradeLevel, a.term) - termOrder(b.gradeLevel, b.term) ||
      a.subject.localeCompare(b.subject) ||
      a.name.localeCompare(b.name),
  );
}

export function coursesIn(
  courses: readonly Course[],
  gradeLevel: GradeLevel,
  term?: Term,
): Course[] {
  return courses.filter(
    (c) => c.gradeLevel === gradeLevel && (term === undefined || c.term === term),
  );
}

export function buildTermSummaries(
  courses: readonly Course[],
  settings: Settings,
  simulate: boolean,
  { includeEmpty = false }: { includeEmpty?: boolean } = {},
): TermSummary[] {
  const out: TermSummary[] = [];

  for (const gradeLevel of GRADE_LEVELS) {
    for (const term of TERMS) {
      const inTerm = sortCourses(coursesIn(courses, gradeLevel, term));
      if (!includeEmpty && inTerm.length === 0) continue;

      out.push({
        key: termKey(gradeLevel, term),
        gradeLevel,
        term,
        label: termLabel(gradeLevel, term),
        shortLabel: shortTermLabel(gradeLevel, term),
        academicYear: academicYear(gradeLevel, settings.graduationYear),
        courses: inTerm,
        ...summarize(inTerm, settings, simulate),
      });
    }
  }

  return out;
}

export function buildYearSummaries(
  courses: readonly Course[],
  settings: Settings,
  simulate: boolean,
  { includeEmpty = false }: { includeEmpty?: boolean } = {},
): YearSummary[] {
  const out: YearSummary[] = [];

  for (const gradeLevel of GRADE_LEVELS) {
    const inYear = sortCourses(coursesIn(courses, gradeLevel));
    if (!includeEmpty && inYear.length === 0) continue;

    out.push({
      gradeLevel,
      label: `${GRADE_NAMES[gradeLevel]} year`,
      academicYear: academicYear(gradeLevel, settings.graduationYear),
      terms: buildTermSummaries(inYear, settings, simulate, { includeEmpty: false }),
      courses: inYear,
      ...summarize(inYear, settings, simulate),
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One point per term that has any graded work, carrying both the term's own GPA
 * and the running cumulative. The chart draws the cumulative line; the term
 * line is the more volatile one underneath it.
 */
export function buildTrend(
  courses: readonly Course[],
  settings: Settings,
  simulate: boolean,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  const seen: Course[] = [];

  for (const gradeLevel of GRADE_LEVELS) {
    for (const term of TERMS) {
      const inTerm = coursesIn(courses, gradeLevel, term);
      if (inTerm.length === 0) continue;

      seen.push(...inTerm);

      const termWeighted = reading(inTerm, settings, true, simulate);
      if (!termWeighted) continue; // nothing graded here yet

      const termUnweighted = reading(inTerm, settings, false, simulate);
      const cumWeighted = reading(seen, settings, true, simulate);
      const cumUnweighted = reading(seen, settings, false, simulate);

      points.push({
        key: termKey(gradeLevel, term),
        label: termLabel(gradeLevel, term),
        shortLabel: shortTermLabel(gradeLevel, term),
        gradeLevel,
        term,
        weighted: termWeighted.gpa,
        unweighted: termUnweighted ? termUnweighted.gpa : null,
        cumulativeWeighted: cumWeighted ? cumWeighted.gpa : null,
        cumulativeUnweighted: cumUnweighted ? cumUnweighted.gpa : null,
        credits: termWeighted.credits,
      });
    }
  }

  return points;
}

/* -------------------------------------------------------------------------- */
/* Target solver                                                               */
/* -------------------------------------------------------------------------- */

export interface TargetResult {
  target: number;
  /** Cumulative GPA as things stand. */
  current: number | null;
  /** 0-1, how far the current GPA has come toward the target. */
  progress: number;
  /** Credits already carrying a grade. */
  earnedCredits: number;
  /** Credits still open. */
  remainingCredits: number;
  /** The GPA those remaining credits must average. `null` when none are left. */
  requiredGpa: number | null;
  /**
   * The same requirement expressed as a raw percentage grade, having subtracted
   * the average difficulty bump of the courses still open — i.e. the number the
   * student actually has to see on a report card.
   */
  requiredPercent: number | null;
  /** Average bump across the remaining courses, used for the line above. */
  remainingBump: number;
  /** Already at or above the target with what is banked. */
  met: boolean;
  /** Reachable in principle: the requirement is a grade a person can earn. */
  achievable: boolean;
  /** No open credits left, and the target was not met. */
  outOfRoad: boolean;
}

const MAX_ATTAINABLE_PERCENT = 100;

/**
 * "What do I need from here?"
 *
 * Solves the credit-weighted average for the grade the remaining coursework has
 * to carry. Both averaging modes are handled, because they need genuinely
 * different algebra: one solves in GPA points, the other in percentages.
 */
export function solveTarget(
  courses: readonly Course[],
  settings: Settings,
  weighted: boolean,
  simulate: boolean,
): TargetResult {
  const target = weighted ? settings.targetWeighted : settings.targetUnweighted;

  let earnedCredits = 0;
  let gpaSum = 0;
  let percentSum = 0;
  let remainingCredits = 0;
  let remainingBumpSum = 0;

  for (const course of courses) {
    if (!(course.credits > 0)) continue;
    const base = effectiveGrade(course, simulate);

    if (base === null) {
      remainingCredits += course.credits;
      remainingBumpSum += bumpFor(course.difficulty, settings) * course.credits;
      continue;
    }

    const pct = weighted ? base + bumpFor(course.difficulty, settings) : base;
    earnedCredits += course.credits;
    percentSum += pct * course.credits;
    gpaSum += percentToGpa(pct, settings.conversion) * course.credits;
  }

  const perCourse = settings.averaging === "per-course";
  const current =
    earnedCredits > 0
      ? perCourse
        ? gpaSum / earnedCredits
        : percentToGpa(percentSum / earnedCredits, settings.conversion)
      : null;

  const remainingBump = remainingCredits > 0 ? remainingBumpSum / remainingCredits : 0;
  const met = current !== null && current >= target - 1e-9;
  const total = earnedCredits + remainingCredits;

  let requiredGpa: number | null = null;
  let requiredPercent: number | null = null;

  if (remainingCredits > 0) {
    if (perCourse) {
      requiredGpa = (target * total - gpaSum) / remainingCredits;
      const bumped = gpaToPercent(requiredGpa, settings.conversion);
      requiredPercent = weighted ? bumped - remainingBump : bumped;
    } else {
      const targetPercent = gpaToPercent(target, settings.conversion);
      const neededPercent = (targetPercent * total - percentSum) / remainingCredits;
      requiredGpa = percentToGpa(neededPercent, settings.conversion);
      requiredPercent = weighted ? neededPercent - remainingBump : neededPercent;
    }
  }

  const achievable =
    requiredPercent === null ? met : requiredPercent <= MAX_ATTAINABLE_PERCENT + 1e-9;

  return {
    target,
    current,
    progress: current === null ? 0 : clamp(current / target, 0, 1),
    earnedCredits: round(earnedCredits, 2),
    remainingCredits: round(remainingCredits, 2),
    requiredGpa,
    requiredPercent,
    remainingBump: round(remainingBump, 2),
    met,
    achievable,
    outOfRoad: !met && remainingCredits <= 0,
  };
}

/**
 * The same question aimed at one course: what grade does *this* class need for
 * the cumulative GPA to land on the target?
 */
export function solveForCourse(
  courses: readonly Course[],
  course: Course,
  settings: Settings,
  weighted: boolean,
  simulate: boolean,
): number | null {
  if (!(course.credits > 0)) return null;

  const others = courses.filter((c) => c.id !== course.id);
  const target = weighted ? settings.targetWeighted : settings.targetUnweighted;

  let credits = 0;
  let gpaSum = 0;
  let percentSum = 0;

  for (const c of others) {
    if (!(c.credits > 0)) continue;
    const base = effectiveGrade(c, simulate);
    if (base === null) continue;
    const pct = weighted ? base + bumpFor(c.difficulty, settings) : base;
    credits += c.credits;
    percentSum += pct * c.credits;
    gpaSum += percentToGpa(pct, settings.conversion) * c.credits;
  }

  const total = credits + course.credits;
  const bump = weighted ? bumpFor(course.difficulty, settings) : 0;

  if (settings.averaging === "per-course") {
    const neededGpa = (target * total - gpaSum) / course.credits;
    return gpaToPercent(neededGpa, settings.conversion) - bump;
  }

  const targetPercent = gpaToPercent(target, settings.conversion);
  return (targetPercent * total - percentSum) / course.credits - bump;
}

/**
 * How much the cumulative weighted GPA moves if this one course's grade
 * changes — the "is this class worth stressing about" number.
 */
export function courseImpact(
  courses: readonly Course[],
  course: Course,
  settings: Settings,
  simulate: boolean,
): number {
  const withCourse = reading(courses, settings, true, simulate);
  const without = reading(
    courses.filter((c) => c.id !== course.id),
    settings,
    true,
    simulate,
  );
  if (!withCourse) return 0;
  if (!without) return withCourse.gpa;
  return withCourse.gpa - without.gpa;
}

/* -------------------------------------------------------------------------- */
/* Credits & distribution                                                      */
/* -------------------------------------------------------------------------- */

export function creditsByDifficulty(
  courses: readonly Course[],
): Record<Difficulty, number> {
  const out: Record<Difficulty, number> = { Regular: 0, Honors: 0, AP: 0 };
  for (const c of courses) {
    if (c.credits > 0) out[c.difficulty] += c.credits;
  }
  return out;
}

export function creditsBySubject(courses: readonly Course[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of courses) {
    if (!(c.credits > 0)) continue;
    out.set(c.subject, (out.get(c.subject) ?? 0) + c.credits);
  }
  return out;
}

/** Credit-weighted average grade per subject, for the subject bar chart. */
export function averageBySubject(
  courses: readonly Course[],
  settings: Settings,
  weighted: boolean,
  simulate: boolean,
): { subject: string; gpa: number; credits: number; courses: number }[] {
  const groups = new Map<string, Course[]>();
  for (const c of courses) {
    const list = groups.get(c.subject);
    if (list) list.push(c);
    else groups.set(c.subject, [c]);
  }

  const out: { subject: string; gpa: number; credits: number; courses: number }[] = [];
  for (const [subject, list] of groups) {
    const r = reading(list, settings, weighted, simulate);
    if (!r) continue;
    out.push({ subject, gpa: r.gpa, credits: r.credits, courses: list.length });
  }
  return out.sort((a, b) => b.gpa - a.gpa);
}

export const totalCredits = (courses: readonly Course[]): number =>
  round(
    courses.reduce((sum, c) => sum + (c.credits > 0 ? c.credits : 0), 0),
    2,
  );

export const earnedCredits = (courses: readonly Course[], simulate: boolean): number =>
  round(
    courses.reduce(
      (sum, c) => (effectiveGrade(c, simulate) !== null && c.credits > 0 ? sum + c.credits : sum),
      0,
    ),
    2,
  );
