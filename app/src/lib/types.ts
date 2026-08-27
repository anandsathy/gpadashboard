/**
 * The whole domain, in one place.
 *
 * Everything downstream — the engine, the store, the UI — imports its shapes
 * from here, so a schema change has exactly one place to start.
 */

export type Difficulty = "Regular" | "Honors" | "AP";

export const DIFFICULTIES: readonly Difficulty[] = ["Regular", "Honors", "AP"] as const;

export type GradeLevel = 9 | 10 | 11 | 12;

export const GRADE_LEVELS: readonly GradeLevel[] = [9, 10, 11, 12] as const;

/** Semester within a school year. */
export type Term = "S1" | "S2";

export const TERMS: readonly Term[] = ["S1", "S2"] as const;

export type Subject =
  | "English"
  | "Mathematics"
  | "Science"
  | "History"
  | "World Language"
  | "Arts"
  | "Computer Science"
  | "Health & PE"
  | "Elective";

export const SUBJECTS: readonly Subject[] = [
  "English",
  "Mathematics",
  "Science",
  "History",
  "World Language",
  "Arts",
  "Computer Science",
  "Health & PE",
  "Elective",
] as const;

export interface Course {
  id: string;
  name: string;
  subject: Subject;
  gradeLevel: GradeLevel;
  term: Term;
  /** Credit hours this semester carries. Year-long courses split across two rows. */
  credits: number;
  difficulty: Difficulty;
  /** The recorded grade, 0-100. `null` means "not graded yet". */
  percent: number | null;
  /**
   * A hypothetical grade used by the Simulate view. It is stored alongside the
   * real grade and never overwrites it: totals only see it while simulation
   * mode is on.
   */
  projected: number | null;
  /** Links the two semester halves of a year-long course. */
  pairId: string | null;
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** How a percentage becomes a point on the 4.0 scale. */
export type Conversion = "linear" | "bands";

/**
 * Whether each course is converted to GPA points and then averaged (the
 * ordinary way, and what "add points to the grade before converting" implies),
 * or whether the percentages are averaged first and converted once.
 */
export type Averaging = "per-course" | "aggregate";

export interface Settings {
  /** Target GPA on the 4.0 scale. */
  targetWeighted: number;
  targetUnweighted: number;
  /** Percentage points added to a grade before conversion, by difficulty. */
  bumps: Record<Difficulty, number>;
  conversion: Conversion;
  averaging: Averaging;
  /** The spring in which grade 12 ends — used to label academic years. */
  graduationYear: number;
  /** Simulation mode: when on, projected grades flow into every total. */
  simulate: boolean;
  theme: ThemeChoice;
  /** Show GPA to this many decimals. */
  precision: 2 | 3;
}

export type ThemeChoice = "light" | "dark" | "system";

export interface Profile {
  name: string | null;
  email: string | null;
  photoURL: string | null;
  uid: string | null;
}

/** The complete persisted document. */
export interface AppData {
  version: number;
  courses: Course[];
  settings: Settings;
  updatedAt: number;
}

export type SyncStatus = "local" | "connecting" | "saving" | "synced" | "offline" | "error";

export type Scale = "gpa" | "percent" | "ten";

/* -------------------------------------------------------------------------- */
/* Computed shapes                                                             */
/* -------------------------------------------------------------------------- */

/** One GPA reading, reported on all three scales the school uses. */
export interface Reading {
  /** Credit-weighted average percentage (already bumped, if weighted). */
  percent: number;
  /** The same average on the 4.0 scale. */
  gpa: number;
  /** The same average out of ten. */
  ten: number;
  /** Credits that went into it. */
  credits: number;
}

export interface Summary {
  weighted: Reading | null;
  unweighted: Reading | null;
  /** Courses that carried a usable grade. */
  gradedCount: number;
  /** Courses still waiting on a grade. */
  ungradedCount: number;
  /** Credits still unearned. */
  openCredits: number;
}

export interface TermKey {
  gradeLevel: GradeLevel;
  term: Term;
}

export interface TermSummary extends Summary {
  key: string;
  gradeLevel: GradeLevel;
  term: Term;
  label: string;
  shortLabel: string;
  academicYear: string;
  courses: Course[];
}

export interface YearSummary extends Summary {
  gradeLevel: GradeLevel;
  label: string;
  academicYear: string;
  terms: TermSummary[];
  courses: Course[];
}

/** A point on the trend chart. */
export interface TrendPoint {
  key: string;
  label: string;
  shortLabel: string;
  gradeLevel: GradeLevel;
  term: Term;
  /** GPA for this term alone. */
  weighted: number | null;
  unweighted: number | null;
  /** GPA for everything up to and including this term. */
  cumulativeWeighted: number | null;
  cumulativeUnweighted: number | null;
  credits: number;
}
