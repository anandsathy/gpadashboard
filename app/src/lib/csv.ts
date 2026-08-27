import { makeCourse } from "./defaults";
import { termName } from "./gpa";
import { clamp } from "./scale";
import {
  DIFFICULTIES,
  GRADE_LEVELS,
  SUBJECTS,
  type Course,
  type Difficulty,
  type GradeLevel,
  type Subject,
  type Term,
} from "./types";

/**
 * CSV import and export.
 *
 * Written by hand rather than pulled in as a dependency, mostly so the import
 * side can be forgiving in the specific ways a spreadsheet export is messy:
 * header casing, alternate column names, `Fall`/`S1`/`1` for the same term, and
 * letter grades where a number was expected.
 */

const COLUMNS = [
  "name",
  "subject",
  "gradeLevel",
  "term",
  "credits",
  "difficulty",
  "percent",
  "projected",
  "note",
] as const;

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote whenever the cell could otherwise break the row.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function coursesToCsv(courses: readonly Course[]): string {
  const rows = [COLUMNS.join(",")];
  for (const course of courses) {
    rows.push(
      [
        course.name,
        course.subject,
        course.gradeLevel,
        course.term,
        course.credits,
        course.difficulty,
        course.percent ?? "",
        course.projected ?? "",
        course.note,
      ]
        .map(escapeCell)
        .join(","),
    );
  }
  // A trailing newline keeps `wc -l` and most spreadsheet importers happy.
  return `${rows.join("\n")}\n`;
}

/* -------------------------------------------------------------------------- */
/* Parse                                                                       */
/* -------------------------------------------------------------------------- */

/** A real CSV split: respects quoted fields, doubled quotes, and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the LF of a CRLF pair.
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* -------------------------------------------------------------------------- */
/* Import                                                                      */
/* -------------------------------------------------------------------------- */

const HEADER_ALIASES: Record<string, (typeof COLUMNS)[number]> = {
  name: "name",
  class: "name",
  course: "name",
  coursename: "name",
  title: "name",

  subject: "subject",
  department: "subject",
  area: "subject",

  gradelevel: "gradeLevel",
  grade_level: "gradeLevel",
  year: "gradeLevel",
  level: "gradeLevel",
  yearlevel: "gradeLevel",

  term: "term",
  semester: "term",
  sem: "term",

  credits: "credits",
  credit: "credits",
  credithours: "credits",
  hours: "credits",
  units: "credits",

  difficulty: "difficulty",
  rigor: "difficulty",
  type: "difficulty",
  coursetype: "difficulty",

  percent: "percent",
  grade: "percent",
  score: "percent",
  percentage: "percent",
  finalgrade: "percent",

  projected: "projected",
  hypothetical: "projected",
  simulated: "projected",
  sim: "projected",

  note: "note",
  notes: "note",
  comment: "note",
};

const normalizeHeader = (raw: string): string =>
  raw.trim().toLowerCase().replace(/[\s_\-.]/g, "");

function readTerm(raw: string): Term {
  const value = raw.trim().toLowerCase();
  if (/^(s2|2|spring|sem2|semester2|second)$/.test(value)) return "S2";
  return "S1";
}

function readDifficulty(raw: string): Difficulty {
  const value = raw.trim().toLowerCase();
  if (/^(ap|advanced ?placement|ib)$/.test(value)) return "AP";
  if (/^(h|hon|honors|honours|advanced)$/.test(value)) return "Honors";
  const exact = DIFFICULTIES.find((d) => d.toLowerCase() === value);
  return exact ?? "Regular";
}

function readGradeLevel(raw: string): GradeLevel {
  const digits = Number(raw.replace(/[^\d]/g, ""));
  if ((GRADE_LEVELS as readonly number[]).includes(digits)) return digits as GradeLevel;
  // "Freshman", "10th", "sophomore"…
  const value = raw.trim().toLowerCase();
  if (value.startsWith("fresh")) return 9;
  if (value.startsWith("soph")) return 10;
  if (value.startsWith("jun")) return 11;
  if (value.startsWith("sen")) return 12;
  return 9;
}

function readSubject(raw: string): Subject | null {
  const value = raw.trim().toLowerCase();
  return SUBJECTS.find((s) => s.toLowerCase() === value) ?? null;
}

export interface CsvImportResult {
  courses: Course[];
  /** Rows that could not be read, with the reason, for reporting back. */
  skipped: { line: number; reason: string }[];
}

/**
 * Reads a CSV into courses. Requires only a name column; everything else has a
 * sensible default, because a partial import beats a refused one.
 */
export function csvToCourses(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const skipped: CsvImportResult["skipped"] = [];

  if (rows.length === 0) return { courses: [], skipped };

  const header = (rows[0] as string[]).map((cell) => HEADER_ALIASES[normalizeHeader(cell)]);
  if (!header.includes("name")) {
    return {
      courses: [],
      skipped: [{ line: 1, reason: "No column that looks like a class name." }],
    };
  }

  const courses: Course[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as string[];
    const record: Partial<Record<(typeof COLUMNS)[number], string>> = {};

    header.forEach((column, index) => {
      if (column) record[column] = row[index] ?? "";
    });

    const name = (record.name ?? "").trim();
    if (name === "") {
      skipped.push({ line: r + 1, reason: "No class name." });
      continue;
    }

    const credits = Number((record.credits ?? "").trim());
    const percent = readNumberOrLetter(record.percent);
    const projected = readNumberOrLetter(record.projected);

    courses.push(
      makeCourse({
        name,
        subject: readSubject(record.subject ?? "") ?? undefined,
        gradeLevel: readGradeLevel(record.gradeLevel ?? ""),
        term: readTerm(record.term ?? ""),
        credits: Number.isFinite(credits) && credits >= 0 ? credits : 0.5,
        difficulty: readDifficulty(record.difficulty ?? ""),
        percent,
        projected,
        note: (record.note ?? "").trim(),
      }),
    );
  }

  return { courses, skipped };
}

function readNumberOrLetter(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (value === "") return null;

  const numeric = Number(value.replace(/%$/, ""));
  if (Number.isFinite(numeric)) return clamp(numeric, 0, 150);

  // Fall back to the letter table via the shared parser.
  const letters: Record<string, number> = {
    "A+": 98, A: 95, "A-": 91, "B+": 88, B: 85, "B-": 81,
    "C+": 78, C: 75, "C-": 71, "D+": 68, D: 65, "D-": 61, F: 50,
  };
  return letters[value.toUpperCase().replace(/[−–]/g, "-")] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Download                                                                    */
/* -------------------------------------------------------------------------- */

/** Hands the browser a file. Object URLs are revoked so the blob is not leaked. */
export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampedName(base: string, extension: string): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `${base}-${stamp}.${extension}`;
}

/** A human-readable transcript, for pasting into an email or a document. */
export function coursesToText(courses: readonly Course[]): string {
  const lines: string[] = [];
  let lastKey = "";

  for (const course of courses) {
    const key = `${course.gradeLevel}-${course.term}`;
    if (key !== lastKey) {
      lines.push("", `Grade ${course.gradeLevel} — ${termName(course.term)}`, "-".repeat(34));
      lastKey = key;
    }
    const grade = course.percent === null ? "—" : course.percent.toFixed(1);
    lines.push(
      `${course.name.padEnd(30)} ${course.difficulty.padEnd(8)} ${String(course.credits).padStart(5)} cr  ${grade.padStart(6)}`,
    );
  }

  return lines.join("\n").trim();
}
