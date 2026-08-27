import { SCHEMA_VERSION, defaultSettings, makeCourse } from "@/lib/defaults";
import { clamp } from "@/lib/scale";
import { percentToGpa } from "@/lib/scale";
import {
  DIFFICULTIES,
  GRADE_LEVELS,
  SUBJECTS,
  TERMS,
  type AppData,
  type Conversion,
  type Course,
  type Difficulty,
  type GradeLevel,
  type Settings,
  type Subject,
  type Term,
} from "@/lib/types";

/**
 * Migration and validation.
 *
 * Two jobs, and the second one matters more than it looks: anything that comes
 * out of `localStorage` or Firestore is untrusted input. A half-written document
 * or a hand-edited export should degrade into a usable transcript, never into a
 * blank screen. Every field below is coerced, defaulted, and clamped.
 */

/* -------------------------------------------------------------------------- */
/* Subject inference                                                           */
/* -------------------------------------------------------------------------- */

const SUBJECT_HINTS: [RegExp, Subject][] = [
  [/\b(english|literature|lit|writing|composition|rhetoric)\b/i, "English"],
  [/\b(algebra|geometry|calculus|precalc|pre-calc|statistics|stats?|math)\b/i, "Mathematics"],
  [/\b(biology|bio|chemistry|chem|physics|anatomy|environmental|science)\b/i, "Science"],
  [/\b(history|government|civics|economics|econ|psychology|sociology)\b/i, "History"],
  [/\b(spanish|french|latin|german|chinese|mandarin|japanese|italian|greek)\b/i, "World Language"],
  [/\b(computer|programming|coding|cs|software)\b/i, "Computer Science"],
  [/\b(art|studio|music|band|orchestra|choir|theater|theatre|drama|dance|film)\b/i, "Arts"],
  [/\b(health|physical education|pe|fitness|athletics)\b/i, "Health & PE"],
];

/** Best guess at a subject from a course name. Falls back to Elective. */
export function inferSubject(name: string): Subject {
  for (const [pattern, subject] of SUBJECT_HINTS) {
    if (pattern.test(name)) return subject;
  }
  return "Elective";
}

/* -------------------------------------------------------------------------- */
/* Coercion helpers                                                            */
/* -------------------------------------------------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/* -------------------------------------------------------------------------- */
/* Legacy v1 — letter grades and an IB track                                   */
/* -------------------------------------------------------------------------- */

const LEGACY_LETTER_PCT: Record<string, number> = {
  "A+": 98, A: 95, "A-": 91,
  "B+": 88, B: 85, "B-": 81,
  "C+": 78, C: 75, "C-": 71,
  "D+": 68, D: 65, "D-": 61,
  F: 50,
};

/* -------------------------------------------------------------------------- */
/* Course normalisation                                                        */
/* -------------------------------------------------------------------------- */

function normalizeGrade(value: unknown): number | null {
  if (typeof value === "string" && value.trim().toUpperCase() in LEGACY_LETTER_PCT) {
    return LEGACY_LETTER_PCT[value.trim().toUpperCase()] as number;
  }
  const n = num(value);
  return n === null ? null : clamp(n, 0, 150);
}

function normalizeDifficulty(value: unknown): Difficulty {
  // The old build offered an IB track that was later folded into AP.
  if (value === "IB") return "AP";
  return oneOf(value, DIFFICULTIES, "Regular");
}

function normalizeGradeLevel(value: unknown): GradeLevel {
  const n = num(value);
  if (n === null) return 9;
  const rounded = Math.round(n);
  return (GRADE_LEVELS as readonly number[]).includes(rounded) ? (rounded as GradeLevel) : 9;
}

export function normalizeCourse(raw: unknown): Course | null {
  if (!isRecord(raw)) return null;

  const name = str(raw.name).trim();
  // A row with no name and no grade is debris, not a course.
  if (name === "" && normalizeGrade(raw.grade ?? raw.percent) === null) return null;

  const credits = num(raw.credits);
  const now = Date.now();

  return {
    id: str(raw.id) || makeCourse({ name: "x", gradeLevel: 9, term: "S1" }).id,
    name: name || "Untitled course",
    // `level` is the old field name; `difficulty` is the new one.
    subject: oneOf(raw.subject, SUBJECTS, inferSubject(name)),
    gradeLevel: normalizeGradeLevel(raw.gradeLevel ?? raw.year),
    term: oneOf(raw.term, TERMS, "S1") as Term,
    credits: credits === null ? 0.5 : clamp(credits, 0, 20),
    difficulty: normalizeDifficulty(raw.difficulty ?? raw.level),
    percent: normalizeGrade(raw.percent ?? raw.grade),
    projected: normalizeGrade(raw.projected ?? raw.sim),
    pairId: typeof raw.pairId === "string" ? raw.pairId : null,
    note: str(raw.note),
    createdAt: num(raw.createdAt) ?? now,
    updatedAt: num(raw.updatedAt) ?? now,
  };
}

/* -------------------------------------------------------------------------- */
/* Settings normalisation                                                      */
/* -------------------------------------------------------------------------- */

function normalizeSettings(raw: unknown, legacyVersion: number): Settings {
  const base = defaultSettings();
  if (!isRecord(raw)) return base;

  const conversion: Conversion =
    // The old build called the linear scale "ten", after the /10 readout.
    raw.scale === "bands" || raw.conversion === "bands" ? "bands" : "linear";

  const bumpsRaw = isRecord(raw.bumps) ? raw.bumps : {};
  const bumps: Record<Difficulty, number> = { ...base.bumps };
  for (const d of DIFFICULTIES) {
    const v = num(bumpsRaw[d]);
    if (v !== null) bumps[d] = clamp(v, -20, 20);
  }
  // The IB track collapsed into AP; keep whichever bump was larger.
  const ibBump = num(bumpsRaw.IB);
  if (ibBump !== null) bumps.AP = Math.max(bumps.AP, clamp(ibBump, -20, 20));

  /*
   * The old build stored a single target as a *percentage* (95) and averaged
   * percentages before converting once. Both are carried forward deliberately:
   * a rewrite that silently changes what someone's GPA reads is a bug, however
   * much more standard the new default is.
   */
  const legacy = legacyVersion > 0 && legacyVersion < SCHEMA_VERSION;
  const rawTargetW = num(raw.targetWeighted) ?? num(raw.target);
  const targetWeighted =
    rawTargetW === null
      ? base.targetWeighted
      : rawTargetW > 6
        ? percentToGpa(rawTargetW, conversion) // it was a percentage
        : rawTargetW;

  const rawTargetU = num(raw.targetUnweighted);
  const targetUnweighted =
    rawTargetU === null
      ? Math.max(0, Math.min(targetWeighted, base.targetUnweighted))
      : rawTargetU > 6
        ? percentToGpa(rawTargetU, conversion)
        : rawTargetU;

  const graduationYear = num(raw.graduationYear);
  const precision = num(raw.precision);

  return {
    targetWeighted: clamp(targetWeighted, 0, 6),
    targetUnweighted: clamp(targetUnweighted, 0, 6),
    bumps,
    conversion,
    averaging: oneOf(
      raw.averaging,
      ["per-course", "aggregate"] as const,
      legacy ? "aggregate" : base.averaging,
    ),
    graduationYear:
      graduationYear === null ? base.graduationYear : clamp(Math.round(graduationYear), 1990, 2100),
    simulate: raw.simulate === true,
    theme: oneOf(raw.theme, ["light", "dark", "system"] as const, base.theme),
    precision: precision === 3 ? 3 : 2,
  };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turns anything vaguely document-shaped into a valid {@link AppData}.
 *
 * Understands the current schema, both earlier ones, and the shape a CSV/JSON
 * export round-trips into. Never throws.
 */
export function hydrate(raw: unknown): AppData {
  if (!isRecord(raw)) {
    return { version: SCHEMA_VERSION, courses: [], settings: defaultSettings(), updatedAt: 0 };
  }

  // `v` was the old version key, `version` is the current one.
  const legacyVersion = num(raw.version) ?? num(raw.v) ?? 0;

  const rawCourses = Array.isArray(raw.courses) ? raw.courses : [];
  const courses = rawCourses
    .map(normalizeCourse)
    .filter((c): c is Course => c !== null);

  const settings = normalizeSettings(raw.settings, legacyVersion);

  // The old build kept the simulation toggle at the document root.
  if (raw.sim === true) settings.simulate = true;

  return {
    version: SCHEMA_VERSION,
    courses: dedupeById(courses),
    settings,
    updatedAt: num(raw.updatedAt) ?? 0,
  };
}

/** Two courses can never share an id — a duplicated id breaks React and edits. */
function dedupeById(courses: Course[]): Course[] {
  const seen = new Set<string>();
  return courses.map((course) => {
    if (!seen.has(course.id)) {
      seen.add(course.id);
      return course;
    }
    const fresh = { ...course, id: makeCourse({ name: course.name, gradeLevel: 9, term: "S1" }).id };
    seen.add(fresh.id);
    return fresh;
  });
}

/** What actually gets written to Firestore and to disk. */
export function serialize(data: AppData): AppData {
  return {
    version: SCHEMA_VERSION,
    courses: data.courses,
    settings: data.settings,
    updatedAt: Date.now(),
  };
}
