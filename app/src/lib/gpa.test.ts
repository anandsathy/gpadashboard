import { describe, expect, it } from "vitest";

import { defaultSettings, makeCourse } from "./defaults";
import {
  academicYear,
  averageBySubject,
  buildTrend,
  buildYearSummaries,
  courseImpact,
  creditsByDifficulty,
  effectiveGrade,
  reading,
  solveForCourse,
  solveTarget,
  summarize,
  weightedPercent,
} from "./gpa";
import { gpaToPercent, parseGrade, percentToGpa, percentToLetter } from "./scale";
import type { Course, Difficulty, GradeLevel, Settings, Subject, Term } from "./types";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

interface Spec {
  name?: string;
  difficulty?: Difficulty;
  gradeLevel?: GradeLevel;
  term?: Term;
  credits?: number;
  percent?: number | null;
  projected?: number | null;
  subject?: Subject;
}

function course(spec: Spec = {}): Course {
  return makeCourse({
    name: spec.name ?? "Course",
    subject: spec.subject ?? "Elective",
    gradeLevel: spec.gradeLevel ?? 9,
    term: spec.term ?? "S1",
    credits: spec.credits ?? 1,
    difficulty: spec.difficulty ?? "Regular",
    percent: spec.percent ?? null,
    projected: spec.projected ?? null,
  });
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), graduationYear: 2028, ...overrides };
}

const near = (actual: number | null | undefined, expected: number) =>
  expect(actual ?? Number.NaN).toBeCloseTo(expected, 6);

/* -------------------------------------------------------------------------- */
/* Scale                                                                       */
/* -------------------------------------------------------------------------- */

describe("percentToGpa — linear", () => {
  it("anchors 100% at 4.0 and 60% at 0.0", () => {
    near(percentToGpa(100, "linear"), 4);
    near(percentToGpa(60, "linear"), 0);
    near(percentToGpa(90, "linear"), 3);
    near(percentToGpa(85, "linear"), 2.5);
  });

  it("floors at zero below passing", () => {
    near(percentToGpa(50, "linear"), 0);
    near(percentToGpa(0, "linear"), 0);
    near(percentToGpa(-20, "linear"), 0);
  });

  it("keeps climbing past 4.0 so the weighting bump survives", () => {
    // An AP 95 becomes 102 before conversion. If this capped at 4.0 the seven
    // extra points would vanish, which is the whole bug this guards against.
    near(percentToGpa(102, "linear"), 4.2);
    near(percentToGpa(107, "linear"), 4.7);
  });
});

describe("percentToGpa — bands", () => {
  it("uses the letter table below 100", () => {
    near(percentToGpa(98, "bands"), 4.0);
    near(percentToGpa(95, "bands"), 4.0);
    near(percentToGpa(91, "bands"), 3.7);
    near(percentToGpa(85, "bands"), 3.0);
    near(percentToGpa(59, "bands"), 0);
  });

  it("extends above 100 on the same slope as the linear scale", () => {
    near(percentToGpa(102, "bands"), 4.2);
    near(percentToGpa(107, "bands"), 4.7);
  });
});

describe("gpaToPercent", () => {
  it("round-trips the linear scale", () => {
    for (const pct of [60, 72.5, 88, 100, 104]) {
      near(gpaToPercent(percentToGpa(pct, "linear"), "linear"), pct);
    }
  });

  it("returns the floor of a band", () => {
    near(gpaToPercent(3.7, "bands"), 90);
    near(gpaToPercent(3.0, "bands"), 83);
    near(gpaToPercent(4.5, "bands"), 105);
  });
});

describe("parseGrade", () => {
  it("reads the things a student actually types", () => {
    expect(parseGrade("92")).toBe(92);
    expect(parseGrade(" 92.5 ")).toBe(92.5);
    expect(parseGrade("92%")).toBe(92);
    expect(parseGrade("A-")).toBe(91);
    expect(parseGrade("a-")).toBe(91);
    expect(parseGrade("B+")).toBe(88);
  });

  it("returns null for nothing and for nonsense", () => {
    expect(parseGrade("")).toBeNull();
    expect(parseGrade("   ")).toBeNull();
    expect(parseGrade("banana")).toBeNull();
  });

  it("clamps absurd numbers instead of trusting them", () => {
    expect(parseGrade("9000")).toBe(150);
    expect(parseGrade("-40")).toBe(0);
  });
});

describe("percentToLetter", () => {
  it("maps the bands", () => {
    expect(percentToLetter(98)).toBe("A+");
    expect(percentToLetter(93)).toBe("A");
    expect(percentToLetter(90)).toBe("A-");
    expect(percentToLetter(72)).toBe("C-");
    expect(percentToLetter(12)).toBe("F");
  });

  it("does not report a super-letter for a bumped grade", () => {
    expect(percentToLetter(107)).toBe("A+");
  });
});

/* -------------------------------------------------------------------------- */
/* Weighting                                                                   */
/* -------------------------------------------------------------------------- */

describe("weightedPercent", () => {
  const s = settings();

  it("adds the difficulty bump to the percentage", () => {
    near(weightedPercent(course({ percent: 95, difficulty: "AP" }), s, false), 102);
    near(weightedPercent(course({ percent: 95, difficulty: "Honors" }), s, false), 100);
    near(weightedPercent(course({ percent: 95, difficulty: "Regular" }), s, false), 95);
  });

  it("honors a custom bump table", () => {
    const custom = settings({ bumps: { Regular: 2, Honors: 5, AP: 7 } });
    near(weightedPercent(course({ percent: 90, difficulty: "Regular" }), custom, false), 92);
  });

  it("is null when the course has no grade", () => {
    expect(weightedPercent(course({ percent: null }), s, false)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Averaging                                                                   */
/* -------------------------------------------------------------------------- */

describe("reading — per-course averaging", () => {
  const s = settings({ averaging: "per-course", conversion: "linear" });

  it("credit-weights the average", () => {
    const courses = [
      course({ percent: 100, credits: 3 }), // 4.0 x 3
      course({ percent: 80, credits: 1 }), // 2.0 x 1
    ];
    // (4*3 + 2*1) / 4 = 3.5
    near(reading(courses, s, false, false)?.gpa, 3.5);
    near(reading(courses, s, false, false)?.credits, 4);
  });

  it("separates weighted from unweighted", () => {
    const courses = [
      course({ percent: 95, difficulty: "AP" }), // 102 -> 4.2 | raw 95 -> 3.5
      course({ percent: 90, difficulty: "Regular" }), //  90 -> 3.0 | raw 90 -> 3.0
    ];
    near(reading(courses, s, true, false)?.gpa, 3.6);
    near(reading(courses, s, false, false)?.gpa, 3.25);
  });

  it("ignores courses with no grade and courses with no credits", () => {
    const courses = [
      course({ percent: 90, credits: 1 }),
      course({ percent: null, credits: 1 }),
      course({ percent: 100, credits: 0 }),
    ];
    near(reading(courses, s, false, false)?.gpa, 3);
    near(reading(courses, s, false, false)?.credits, 1);
  });

  it("is null when nothing is graded", () => {
    expect(reading([course({ percent: null })], s, false, false)).toBeNull();
    expect(reading([], s, false, false)).toBeNull();
  });
});

describe("reading — aggregate averaging", () => {
  it("averages percentages first, then converts once", () => {
    const s = settings({ averaging: "aggregate", conversion: "bands" });
    const courses = [course({ percent: 100 }), course({ percent: 80 })];
    // Average is 90, which bands to an A- (3.7). Converting each course first
    // gives A+ (4.0) and B- (2.7), averaging to 3.35. The two modes are
    // supposed to disagree here, and by a lot.
    near(reading(courses, s, false, false)?.gpa, 3.7);

    const perCourse = settings({ averaging: "per-course", conversion: "bands" });
    near(reading(courses, perCourse, false, false)?.gpa, 3.35);
  });

  it("reports the averaged percentage on all three scales", () => {
    const s = settings({ averaging: "aggregate" });
    const r = reading([course({ percent: 92, credits: 1 }), course({ percent: 88, credits: 1 })], s, false, false);
    near(r?.percent, 90);
    near(r?.ten, 9);
    near(r?.gpa, 3);
  });
});

/* -------------------------------------------------------------------------- */
/* Simulation isolation                                                        */
/* -------------------------------------------------------------------------- */

describe("simulation never leaks into real totals", () => {
  const s = settings();

  it("ignores projected grades when simulation is off", () => {
    const courses = [course({ percent: 90 }), course({ percent: null, projected: 100 })];
    near(reading(courses, s, false, false)?.gpa, 3);
    near(reading(courses, s, false, false)?.credits, 1);
  });

  it("fills in blanks when simulation is on", () => {
    const courses = [course({ percent: 90 }), course({ percent: null, projected: 100 })];
    near(reading(courses, s, false, true)?.gpa, 3.5);
    near(reading(courses, s, false, true)?.credits, 2);
  });

  it("lets a projection override a recorded grade while simulating", () => {
    const c = course({ percent: 80, projected: 100 });
    expect(effectiveGrade(c, false)).toBe(80);
    expect(effectiveGrade(c, true)).toBe(100);
  });

  it("treats a non-finite projection as absent", () => {
    const c = course({ percent: null, projected: Number.NaN });
    expect(effectiveGrade(c, true)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Summaries and grouping                                                      */
/* -------------------------------------------------------------------------- */

describe("summarize", () => {
  it("counts graded, ungraded, and open credits", () => {
    const s = settings();
    const result = summarize(
      [
        course({ percent: 90, credits: 1 }),
        course({ percent: null, credits: 0.5 }),
        course({ percent: null, credits: 1.5 }),
      ],
      s,
      false,
    );
    expect(result.gradedCount).toBe(1);
    expect(result.ungradedCount).toBe(2);
    expect(result.openCredits).toBe(2);
    near(result.weighted?.gpa, 3);
  });
});

describe("buildYearSummaries", () => {
  it("groups by grade level and nests the terms", () => {
    const s = settings();
    const courses = [
      course({ gradeLevel: 9, term: "S1", percent: 90 }),
      course({ gradeLevel: 9, term: "S2", percent: 100 }),
      course({ gradeLevel: 10, term: "S1", percent: 80 }),
    ];
    const years = buildYearSummaries(courses, s, false);

    expect(years.map((y) => y.gradeLevel)).toEqual([9, 10]);
    expect(years[0]?.terms).toHaveLength(2);
    near(years[0]?.weighted?.gpa, 3.5); // the 9th grade year as a whole
    near(years[0]?.terms[0]?.weighted?.gpa, 3); // fall alone
    expect(years[0]?.academicYear).toBe("2024–25");
  });

  it("omits grade levels with no courses", () => {
    const years = buildYearSummaries([course({ gradeLevel: 11, percent: 90 })], settings(), false);
    expect(years).toHaveLength(1);
    expect(years[0]?.gradeLevel).toBe(11);
  });
});

describe("academicYear", () => {
  it("counts back from the graduation spring", () => {
    expect(academicYear(12, 2028)).toBe("2027–28");
    expect(academicYear(11, 2028)).toBe("2026–27");
    expect(academicYear(9, 2028)).toBe("2024–25");
  });
});

/* -------------------------------------------------------------------------- */
/* Trend                                                                       */
/* -------------------------------------------------------------------------- */

describe("buildTrend", () => {
  const s = settings();

  it("reports each term and the running cumulative", () => {
    const courses = [
      course({ gradeLevel: 9, term: "S1", percent: 100 }), // 4.0
      course({ gradeLevel: 9, term: "S2", percent: 80 }), // 2.0
    ];
    const trend = buildTrend(courses, s, false);

    expect(trend).toHaveLength(2);
    near(trend[0]?.weighted, 4);
    near(trend[0]?.cumulativeWeighted, 4);
    near(trend[1]?.weighted, 2);
    near(trend[1]?.cumulativeWeighted, 3); // both terms together
  });

  it("stays in chronological order across grade levels", () => {
    const courses = [
      course({ gradeLevel: 11, term: "S1", percent: 90 }),
      course({ gradeLevel: 9, term: "S2", percent: 90 }),
      course({ gradeLevel: 10, term: "S1", percent: 90 }),
    ];
    expect(buildTrend(courses, s, false).map((p) => p.key)).toEqual(["9-S2", "10-S1", "11-S1"]);
  });

  it("skips terms that have courses but no grades", () => {
    const courses = [
      course({ gradeLevel: 9, term: "S1", percent: 90 }),
      course({ gradeLevel: 9, term: "S2", percent: null }),
    ];
    expect(buildTrend(courses, s, false)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* The target solver                                                           */
/* -------------------------------------------------------------------------- */

describe("solveTarget — per-course averaging", () => {
  const s = settings({ averaging: "per-course", conversion: "linear", targetWeighted: 3.5 });

  it("solves the average the remaining credits must carry", () => {
    const courses = [
      course({ percent: 90, credits: 1, difficulty: "Regular" }), // 3.0
      course({ percent: null, credits: 1, difficulty: "Regular" }),
    ];
    const r = solveTarget(courses, s, true, false);

    // (3.0 + x) / 2 = 3.5  ->  x = 4.0  ->  100%
    near(r.requiredGpa, 4);
    near(r.requiredPercent, 100);
    expect(r.achievable).toBe(true);
    expect(r.met).toBe(false);
  });

  it("subtracts the bump the remaining courses already carry", () => {
    const courses = [
      course({ percent: 90, credits: 1, difficulty: "Regular" }),
      course({ percent: null, credits: 1, difficulty: "AP" }),
    ];
    const r = solveTarget(courses, s, true, false);

    // Still needs a 4.0 from that slot, but an AP course gets there on a 93:
    // 93 + 7 = 100.
    near(r.requiredGpa, 4);
    near(r.requiredPercent, 93);
    near(r.remainingBump, 7);
    expect(r.achievable).toBe(true);
  });

  it("flags a target that no achievable grade can reach", () => {
    const hard = settings({ targetWeighted: 4.0 });
    const courses = [
      course({ percent: 90, credits: 1, difficulty: "Regular" }), // 3.0
      course({ percent: null, credits: 1, difficulty: "Regular" }),
    ];
    const r = solveTarget(courses, hard, true, false);

    // Would need a 5.0 from one Regular credit — a 110%.
    near(r.requiredGpa, 5);
    near(r.requiredPercent, 110);
    expect(r.achievable).toBe(false);
  });

  it("reports met when the banked average already clears the target", () => {
    const r = solveTarget([course({ percent: 100, credits: 1 })], s, true, false);
    expect(r.met).toBe(true);
    near(r.current, 4);
    expect(r.progress).toBe(1);
  });

  it("reports out of road when nothing is left and the target was missed", () => {
    const r = solveTarget([course({ percent: 80, credits: 1 })], s, true, false);
    expect(r.met).toBe(false);
    expect(r.outOfRoad).toBe(true);
    expect(r.requiredGpa).toBeNull();
  });

  it("tracks earned and remaining credits separately", () => {
    const r = solveTarget(
      [course({ percent: 90, credits: 1.5 }), course({ percent: null, credits: 2.25 })],
      s,
      true,
      false,
    );
    expect(r.earnedCredits).toBe(1.5);
    expect(r.remainingCredits).toBe(2.25);
  });

  it("uses the unweighted target when asked for unweighted", () => {
    const custom = settings({ targetWeighted: 4.2, targetUnweighted: 3.0 });
    const r = solveTarget([course({ percent: 90, difficulty: "AP" })], custom, false, false);
    expect(r.target).toBe(3.0);
    near(r.current, 3.0); // raw 90, bump ignored
    expect(r.met).toBe(true);
  });
});

describe("solveTarget — aggregate averaging", () => {
  it("solves in percentage space", () => {
    const s = settings({ averaging: "aggregate", conversion: "linear", targetWeighted: 3.5 });
    const courses = [
      course({ percent: 90, credits: 1, difficulty: "Regular" }),
      course({ percent: null, credits: 1, difficulty: "Regular" }),
    ];
    const r = solveTarget(courses, s, true, false);
    // Target 3.5 is a 95% average; (90 + x)/2 = 95 -> x = 100.
    near(r.requiredPercent, 100);
  });
});

describe("solveForCourse", () => {
  it("answers what one class needs on its own", () => {
    const s = settings({ targetWeighted: 3.5, averaging: "per-course", conversion: "linear" });
    const banked = course({ percent: 90, credits: 1, difficulty: "Regular" });
    const open = course({ percent: null, credits: 1, difficulty: "Honors" });

    // Needs a 4.0 from the slot; an Honors bump of +5 gets there on a 95.
    near(solveForCourse([banked, open], open, s, true, false), 95);
  });

  it("returns null for a zero-credit course", () => {
    const s = settings();
    const zero = course({ credits: 0 });
    expect(solveForCourse([zero], zero, s, true, false)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Impact and distribution                                                     */
/* -------------------------------------------------------------------------- */

describe("courseImpact", () => {
  it("is negative for a course dragging the average down", () => {
    const s = settings();
    const courses = [
      course({ percent: 100, credits: 1 }),
      course({ percent: 100, credits: 1 }),
      course({ percent: 70, credits: 1 }),
    ];
    const drag = courses[2] as Course;
    expect(courseImpact(courses, drag, s, false)).toBeLessThan(0);
  });

  it("is positive for a course pulling the average up", () => {
    const s = settings();
    const courses = [course({ percent: 70, credits: 1 }), course({ percent: 100, credits: 1 })];
    const lift = courses[1] as Course;
    expect(courseImpact(courses, lift, s, false)).toBeGreaterThan(0);
  });
});

describe("creditsByDifficulty", () => {
  it("sums credits per track and skips non-positive credits", () => {
    const mix = creditsByDifficulty([
      course({ difficulty: "AP", credits: 1 }),
      course({ difficulty: "AP", credits: 0.5 }),
      course({ difficulty: "Honors", credits: 1 }),
      course({ difficulty: "Regular", credits: 0 }),
    ]);
    expect(mix).toEqual({ AP: 1.5, Honors: 1, Regular: 0 });
  });
});

describe("averageBySubject", () => {
  it("ranks subjects by weighted average", () => {
    const s = settings();
    const ranked = averageBySubject(
      [
        course({ subject: "Mathematics", percent: 100 }),
        course({ subject: "English", percent: 80 }),
        course({ subject: "English", percent: 80 }),
      ],
      s,
      true,
      false,
    );
    expect(ranked.map((r) => r.subject)).toEqual(["Mathematics", "English"]);
    near(ranked[0]?.gpa, 4);
    expect(ranked[1]?.courses).toBe(2);
  });
});
