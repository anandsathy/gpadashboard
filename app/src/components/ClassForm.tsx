import { useEffect, useMemo, useState } from "react";

import { useStore } from "@/store/StoreProvider";
import { CATALOG, type NewCourseInput } from "@/lib/defaults";
import { inferSubject } from "@/store/migrate";
import { formatBump, trimZeros } from "@/lib/format";
import { GRADE_NAMES, termLabel } from "@/lib/gpa";
import { parseGrade, percentToLetter } from "@/lib/scale";
import {
  DIFFICULTIES,
  GRADE_LEVELS,
  SUBJECTS,
  type Course,
  type Difficulty,
  type GradeLevel,
  type Subject,
  type Term,
} from "@/lib/types";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconSparkle, IconTrash } from "@/components/ui/Icons";
import { Badge, Button, Field, Input, Select, Textarea, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/** "FY" is a form-only value: it expands into one course per semester. */
type FormTerm = Term | "FY";

export interface ClassFormProps {
  open: boolean;
  onClose: () => void;
  /** The course being edited, or null to add a new one. */
  course: Course | null;
  /** Pre-fills the term selectors when adding from a specific semester. */
  preset?: { gradeLevel?: GradeLevel; term?: Term };
}

interface FormState {
  name: string;
  subject: Subject;
  gradeLevel: GradeLevel;
  term: FormTerm;
  credits: string;
  difficulty: Difficulty;
  grade: string;
  note: string;
}

export function ClassForm({ open, onClose, course, preset }: ClassFormProps) {
  const { data, settings, dispatch } = useStore();
  const { toast } = useToast();

  const sibling = useMemo(
    () =>
      course?.pairId
        ? (data.courses.find((c) => c.pairId === course.pairId && c.id !== course.id) ?? null)
        : null,
    [course, data.courses],
  );

  const [form, setForm] = useState<FormState>(() => blankForm(preset));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  // Reload the form whenever the modal opens on a different course.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setShowCatalog(false);
    setForm(course ? formFromCourse(course, sibling) : blankForm(preset));
  }, [open, course, sibling, preset]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const parsedGrade = parseGrade(form.grade);
  const bump = settings.bumps[form.difficulty] ?? 0;
  const isFullYear = form.term === "FY";
  const creditsNumber = Number(form.credits);

  const submit = () => {
    const name = form.name.trim();
    if (name === "") {
      setError("Give the class a name.");
      return;
    }
    if (!Number.isFinite(creditsNumber) || creditsNumber < 0) {
      setError("Credits must be a number, and not a negative one.");
      return;
    }
    if (form.grade.trim() !== "" && parsedGrade === null) {
      setError("Enter a percentage like 92, or a letter like A−.");
      return;
    }

    const base: NewCourseInput = {
      name,
      subject: form.subject,
      gradeLevel: form.gradeLevel,
      // A full-year course is created from the fall row; the reducer adds the
      // spring half itself.
      term: form.term === "FY" ? "S1" : form.term,
      credits: creditsNumber,
      difficulty: form.difficulty,
      percent: parsedGrade,
      note: form.note.trim(),
    };

    if (course) {
      dispatch({
        type: "update-course-pair",
        id: course.id,
        patch: {
          name,
          subject: form.subject,
          gradeLevel: form.gradeLevel,
          term: isFullYear ? course.term : (form.term as Term),
          credits: creditsNumber,
          difficulty: form.difficulty,
          percent: parsedGrade,
          note: form.note.trim(),
        },
      });
      toast(`Saved ${name}.`, { tone: "good" });
    } else if (isFullYear) {
      dispatch({ type: "add-year-long", input: base });
      toast(`Added ${name} to both semesters.`, { tone: "good" });
    } else {
      dispatch({ type: "add-course", input: base });
      toast(`Added ${name}.`, { tone: "good" });
    }

    onClose();
  };

  const remove = () => {
    if (!course) return;
    const name = course.name;
    const ids = sibling ? [course.id, sibling.id] : [course.id];
    dispatch({ type: "delete-courses", ids, label: `delete ${name}` });
    toast(`Deleted ${name}.`, { tone: "neutral" });
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={course ? `Edit ${course.name}` : "Add a class"}
        description={
          sibling
            ? "This class runs both semesters. Name, subject, and difficulty update in both; each semester keeps its own grade and credits."
            : undefined
        }
        footer={
          <>
            {course ? (
              <Button variant="danger" size="md" onClick={() => setConfirmDelete(true)} className="mr-auto">
                <IconTrash size={15} />
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="solid" onClick={submit}>
              {course ? "Save changes" : "Add class"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Name + quick-add ------------------------------------------------ */}
          <Field
            label="Class name"
            htmlFor="cf-name"
            error={error && error.includes("name") ? error : null}
          >
            <div className="flex gap-2">
              <Input
                id="cf-name"
                data-autofocus
                value={form.name}
                placeholder="AP Chemistry"
                onChange={(event) => {
                  const name = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    name,
                    // Only auto-fill the subject while the student has not
                    // chosen one themselves.
                    subject: prev.subject === "Elective" ? inferSubject(name) : prev.subject,
                  }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
              {!course ? (
                <Button
                  variant={showCatalog ? "solid" : "outline"}
                  onClick={() => setShowCatalog((v) => !v)}
                  title="Pick from a list of common courses"
                >
                  <IconSparkle size={15} />
                  <span className="hidden sm:inline">Catalog</span>
                </Button>
              ) : null}
            </div>
          </Field>

          {showCatalog ? <CatalogPicker onPick={(entry) => {
            setForm((prev) => ({
              ...prev,
              name: entry.name,
              subject: entry.subject,
              difficulty: entry.difficulty,
            }));
            setShowCatalog(false);
          }} /> : null}

          {/* Subject + difficulty -------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject" htmlFor="cf-subject">
              <Select
                id="cf-subject"
                value={form.subject}
                onChange={(event) => set("subject", event.target.value as Subject)}
              >
                {SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Difficulty"
              hint={`${form.difficulty} adds ${formatBump(bump)} to the grade before it is converted.`}
            >
              <div className="flex gap-1.5">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => set("difficulty", level)}
                    className={cx(
                      "h-10 flex-1 rounded-[10px] border text-[13px] font-semibold transition-colors",
                      form.difficulty === level
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-line-strong bg-surface text-ink-2 hover:border-brand hover:text-brand",
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* When ------------------------------------------------------------ */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Grade level" htmlFor="cf-year">
              <Select
                id="cf-year"
                value={form.gradeLevel}
                onChange={(event) => set("gradeLevel", Number(event.target.value) as GradeLevel)}
              >
                {GRADE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}th — {GRADE_NAMES[level]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Semester" htmlFor="cf-term">
              <Select
                id="cf-term"
                value={form.term}
                onChange={(event) => set("term", event.target.value as FormTerm)}
                disabled={Boolean(sibling)}
              >
                <option value="S1">Fall (S1)</option>
                <option value="S2">Spring (S2)</option>
                {!course ? <option value="FY">Full year — both</option> : null}
              </Select>
            </Field>

            <Field
              label="Credits"
              htmlFor="cf-credits"
              hint={
                isFullYear && creditsNumber > 0
                  ? `${trimZeros((creditsNumber / 2).toFixed(2))} per semester`
                  : undefined
              }
              error={error && error.includes("Credits") ? error : null}
            >
              <Input
                id="cf-credits"
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                value={form.credits}
                onChange={(event) => set("credits", event.target.value)}
              />
            </Field>
          </div>

          {/* Grade ------------------------------------------------------------ */}
          <Field
            label="Grade"
            htmlFor="cf-grade"
            hint="A percentage or a letter. Leave it empty until the class is graded."
            error={error && error.includes("percentage") ? error : null}
          >
            <div className="flex items-center gap-3">
              <Input
                id="cf-grade"
                value={form.grade}
                placeholder="92 or A−"
                inputMode="decimal"
                className="max-w-36"
                onChange={(event) => set("grade", event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
              />
              {parsedGrade !== null ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{percentToLetter(parsedGrade)}</Badge>
                  {bump !== 0 ? (
                    <Badge tone="brand" title="The grade after the difficulty bump">
                      weighted {trimZeros((parsedGrade + bump).toFixed(1))}
                    </Badge>
                  ) : null}
                </div>
              ) : form.grade.trim() === "" ? (
                <span className="text-[12.5px] text-ink-3">Ungraded — it won't affect your GPA.</span>
              ) : null}
            </div>
          </Field>

          <Field label="Note" htmlFor="cf-note" hint="Optional. Only you see this.">
            <Textarea
              id="cf-note"
              value={form.note}
              rows={2}
              placeholder="Second-quarter grade replaced the midterm…"
              onChange={(event) => set("note", event.target.value)}
            />
          </Field>

          {course ? (
            <p className="text-[12px] text-ink-3">
              {termLabel(course.gradeLevel, course.term)}
              {sibling ? " · linked to the other semester" : ""}
            </p>
          ) : null}
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete ${course?.name}?`}
        confirmLabel={sibling ? "Delete both semesters" : "Delete"}
        body={
          sibling
            ? "This class runs both semesters, so both rows go. You can undo straight afterwards."
            : "It comes off your transcript and out of every average. You can undo straight afterwards."
        }
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Catalog                                                                     */
/* -------------------------------------------------------------------------- */

function CatalogPicker({ onPick }: { onPick: (entry: (typeof CATALOG)[number]) => void }) {
  const [filter, setFilter] = useState("");

  const matches = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const list = query
      ? CATALOG.filter(
          (entry) =>
            entry.name.toLowerCase().includes(query) || entry.subject.toLowerCase().includes(query),
        )
      : CATALOG;
    return list.slice(0, 40);
  }, [filter]);

  return (
    <div className="rounded-[12px] border border-line bg-surface-2 p-3">
      <Input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter the catalog…"
        className="mb-2.5 h-9 bg-surface"
      />
      <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
        {matches.map((entry) => (
          <button
            key={`${entry.name}-${entry.subject}`}
            type="button"
            onClick={() => onPick(entry)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
          >
            {entry.name}
          </button>
        ))}
        {matches.length === 0 ? (
          <p className="px-1 py-2 text-[12.5px] text-ink-3">
            Nothing in the catalog matches — just type the name above.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form helpers                                                                */
/* -------------------------------------------------------------------------- */

function blankForm(preset?: { gradeLevel?: GradeLevel; term?: Term }): FormState {
  return {
    name: "",
    subject: "Elective",
    gradeLevel: preset?.gradeLevel ?? 9,
    term: preset?.term ?? "S1",
    credits: "0.5",
    difficulty: "Regular",
    grade: "",
    note: "",
  };
}

function formFromCourse(course: Course, sibling: Course | null): FormState {
  return {
    name: course.name,
    subject: course.subject,
    gradeLevel: course.gradeLevel,
    term: sibling ? "FY" : course.term,
    credits: String(course.credits),
    difficulty: course.difficulty,
    grade: course.percent === null ? "" : String(course.percent),
    note: course.note,
  };
}
