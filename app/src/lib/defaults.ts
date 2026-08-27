import { uid } from "./id";
import type { AppData, Course, Difficulty, GradeLevel, Settings, Subject, Term } from "./types";

export const SCHEMA_VERSION = 3;

/**
 * The weighting rule.
 *
 * The school adds points to the *percentage* before it is converted to the 4.0
 * scale. The defaults below match the published policy — Regular +0, Honors +5,
 * AP +7 — and every one of them is editable in Settings, because the exact
 * numbers are the kind of thing a school changes without telling anyone.
 */
export const DEFAULT_BUMPS: Record<Difficulty, number> = {
  Regular: 0,
  Honors: 5,
  AP: 7,
};

/** A student starting grade 9 this fall graduates four springs from now. */
export function defaultGraduationYear(now = new Date()): number {
  // Treat July as the turn of the school year.
  const schoolYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return schoolYearStart + 4;
}

export function defaultSettings(): Settings {
  return {
    targetWeighted: 4.0,
    targetUnweighted: 3.8,
    bumps: { ...DEFAULT_BUMPS },
    conversion: "linear",
    averaging: "per-course",
    graduationYear: defaultGraduationYear(),
    simulate: false,
    theme: "system",
    precision: 2,
  };
}

export function defaultData(): AppData {
  return {
    version: SCHEMA_VERSION,
    courses: [],
    settings: defaultSettings(),
    updatedAt: Date.now(),
  };
}

export interface NewCourseInput {
  name: string;
  subject?: Subject;
  gradeLevel: GradeLevel;
  term: Term;
  credits?: number;
  difficulty?: Difficulty;
  percent?: number | null;
  projected?: number | null;
  pairId?: string | null;
  note?: string;
}

export function makeCourse(input: NewCourseInput): Course {
  const now = Date.now();
  return {
    id: uid(),
    name: input.name.trim() || "Untitled course",
    subject: input.subject ?? "Elective",
    gradeLevel: input.gradeLevel,
    term: input.term,
    credits: input.credits ?? 0.5,
    difficulty: input.difficulty ?? "Regular",
    percent: input.percent ?? null,
    projected: input.projected ?? null,
    pairId: input.pairId ?? null,
    note: input.note ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/* Quick-add catalog                                                           */
/* -------------------------------------------------------------------------- */

export interface CatalogEntry {
  name: string;
  subject: Subject;
  difficulty: Difficulty;
}

/**
 * A starter catalog so adding a schedule is three clicks instead of thirty
 * keystrokes. Nothing here is authoritative — it is a convenience list, and any
 * course can still be typed in by hand.
 */
export const CATALOG: readonly CatalogEntry[] = [
  { name: "English 9", subject: "English", difficulty: "Regular" },
  { name: "English 10", subject: "English", difficulty: "Regular" },
  { name: "American Literature", subject: "English", difficulty: "Honors" },
  { name: "AP English Language", subject: "English", difficulty: "AP" },
  { name: "AP English Literature", subject: "English", difficulty: "AP" },

  { name: "Algebra I", subject: "Mathematics", difficulty: "Regular" },
  { name: "Geometry", subject: "Mathematics", difficulty: "Regular" },
  { name: "Algebra II", subject: "Mathematics", difficulty: "Honors" },
  { name: "Precalculus", subject: "Mathematics", difficulty: "Honors" },
  { name: "AP Calculus AB", subject: "Mathematics", difficulty: "AP" },
  { name: "AP Calculus BC", subject: "Mathematics", difficulty: "AP" },
  { name: "AP Statistics", subject: "Mathematics", difficulty: "AP" },

  { name: "Biology", subject: "Science", difficulty: "Regular" },
  { name: "Chemistry", subject: "Science", difficulty: "Honors" },
  { name: "Physics", subject: "Science", difficulty: "Honors" },
  { name: "AP Biology", subject: "Science", difficulty: "AP" },
  { name: "AP Chemistry", subject: "Science", difficulty: "AP" },
  { name: "AP Physics 1", subject: "Science", difficulty: "AP" },

  { name: "World History", subject: "History", difficulty: "Regular" },
  { name: "U.S. History", subject: "History", difficulty: "Honors" },
  { name: "AP U.S. History", subject: "History", difficulty: "AP" },
  { name: "AP World History", subject: "History", difficulty: "AP" },
  { name: "AP U.S. Government", subject: "History", difficulty: "AP" },

  { name: "Spanish II", subject: "World Language", difficulty: "Regular" },
  { name: "Spanish III", subject: "World Language", difficulty: "Honors" },
  { name: "AP Spanish Language", subject: "World Language", difficulty: "AP" },
  { name: "Latin II", subject: "World Language", difficulty: "Regular" },
  { name: "French III", subject: "World Language", difficulty: "Honors" },

  { name: "AP Computer Science A", subject: "Computer Science", difficulty: "AP" },
  { name: "Intro to Computer Science", subject: "Computer Science", difficulty: "Regular" },

  { name: "Studio Art", subject: "Arts", difficulty: "Regular" },
  { name: "Music Theory", subject: "Arts", difficulty: "Honors" },
  { name: "AP Art History", subject: "Arts", difficulty: "AP" },

  { name: "Health", subject: "Health & PE", difficulty: "Regular" },
  { name: "Physical Education", subject: "Health & PE", difficulty: "Regular" },
] as const;

/* -------------------------------------------------------------------------- */
/* Sample transcript                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Seeds a believable four-semester transcript so the dashboard has something to
 * draw on the first run. Offered from the empty state, never applied silently.
 */
export function sampleCourses(): Course[] {
  const spec: [string, Subject, Difficulty, GradeLevel, Term, number, number | null][] = [
    ["English 9", "English", "Regular", 9, "S1", 0.5, 92],
    ["Algebra I", "Mathematics", "Regular", 9, "S1", 0.5, 88],
    ["Biology", "Science", "Honors", 9, "S1", 0.5, 90],
    ["World History", "History", "Regular", 9, "S1", 0.5, 94],
    ["Spanish II", "World Language", "Regular", 9, "S1", 0.5, 89],

    ["English 9", "English", "Regular", 9, "S2", 0.5, 94],
    ["Algebra I", "Mathematics", "Regular", 9, "S2", 0.5, 91],
    ["Biology", "Science", "Honors", 9, "S2", 0.5, 93],
    ["World History", "History", "Regular", 9, "S2", 0.5, 92],
    ["Spanish II", "World Language", "Regular", 9, "S2", 0.5, 90],

    ["English 10", "English", "Honors", 10, "S1", 0.5, 91],
    ["Geometry", "Mathematics", "Honors", 10, "S1", 0.5, 87],
    ["Chemistry", "Science", "Honors", 10, "S1", 0.5, 89],
    ["AP World History", "History", "AP", 10, "S1", 0.5, 93],
    ["Spanish III", "World Language", "Honors", 10, "S1", 0.5, 92],

    ["English 10", "English", "Honors", 10, "S2", 0.5, 93],
    ["Geometry", "Mathematics", "Honors", 10, "S2", 0.5, 90],
    ["Chemistry", "Science", "Honors", 10, "S2", 0.5, 91],
    ["AP World History", "History", "AP", 10, "S2", 0.5, 95],
    ["Spanish III", "World Language", "Honors", 10, "S2", 0.5, 94],

    ["AP English Language", "English", "AP", 11, "S1", 0.5, null],
    ["Precalculus", "Mathematics", "Honors", 11, "S1", 0.5, null],
    ["AP Chemistry", "Science", "AP", 11, "S1", 0.5, null],
    ["AP U.S. History", "History", "AP", 11, "S1", 0.5, null],
    ["AP Computer Science A", "Computer Science", "AP", 11, "S1", 0.5, null],
  ];

  return spec.map(([name, subject, difficulty, gradeLevel, term, credits, percent]) =>
    makeCourse({ name, subject, difficulty, gradeLevel, term, credits, percent }),
  );
}
