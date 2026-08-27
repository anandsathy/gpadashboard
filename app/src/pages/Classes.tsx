import { useMemo, useState } from "react";

import { useStore } from "@/store/StoreProvider";
import { formatGpa, formatPercent, pluralize, trimZeros } from "@/lib/format";
import {
  GRADE_NAMES,
  courseGpa,
  effectiveGrade,
  reading,
  sortCourses,
  termName,
  weightedPercent,
} from "@/lib/gpa";
import { parseGrade, percentToLetter } from "@/lib/scale";
import {
  DIFFICULTIES,
  GRADE_LEVELS,
  TERMS,
  type Course,
  type Difficulty,
  type GradeLevel,
  type Term,
} from "@/lib/types";
import { ConfirmModal } from "@/components/ui/Modal";
import {
  IconClasses,
  IconCopy,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@/components/ui/Icons";
import {
  Badge,
  Button,
  Card,
  DifficultyBadge,
  EmptyState,
  Input,
  Segmented,
  Select,
  cx,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/**
 * The Classes page.
 *
 * A working table, not a display: grades are editable in place, because the
 * single most common thing a student does here is type a number into one cell
 * and immediately want to see what it did to the average.
 */

type LevelFilter = Difficulty | "all";
type StatusFilter = "all" | "graded" | "ungraded";
type SortKey = "chronological" | "name" | "grade-desc" | "grade-asc" | "credits";

export function Classes({
  onEditCourse,
  onAddClass,
}: {
  onEditCourse: (course: Course) => void;
  onAddClass: (preset?: { gradeLevel?: GradeLevel; term?: Term }) => void;
}) {
  const { data, settings, dispatch } = useStore();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<GradeLevel | "all">("all");
  const [termFilter, setTermFilter] = useState<Term | "all">("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("chronological");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = data.courses.filter((course) => {
      if (yearFilter !== "all" && course.gradeLevel !== yearFilter) return false;
      if (termFilter !== "all" && course.term !== termFilter) return false;
      if (levelFilter !== "all" && course.difficulty !== levelFilter) return false;

      const graded = course.percent !== null;
      if (statusFilter === "graded" && !graded) return false;
      if (statusFilter === "ungraded" && graded) return false;

      if (needle === "") return true;
      return (
        course.name.toLowerCase().includes(needle) ||
        course.subject.toLowerCase().includes(needle) ||
        course.difficulty.toLowerCase().includes(needle) ||
        course.note.toLowerCase().includes(needle)
      );
    });

    switch (sortKey) {
      case "name":
        return [...matches].sort((a, b) => a.name.localeCompare(b.name));
      case "grade-desc":
        return [...matches].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
      case "grade-asc":
        return [...matches].sort((a, b) => (a.percent ?? 999) - (b.percent ?? 999));
      case "credits":
        return [...matches].sort((a, b) => b.credits - a.credits);
      default:
        return sortCourses(matches);
    }
  }, [data.courses, query, yearFilter, termFilter, levelFilter, statusFilter, sortKey]);

  const grouped = useMemo(() => {
    if (sortKey !== "chronological") return null;

    const buckets = new Map<string, { gradeLevel: GradeLevel; term: Term; courses: Course[] }>();
    for (const course of filtered) {
      const key = `${course.gradeLevel}-${course.term}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.courses.push(course);
      else buckets.set(key, { gradeLevel: course.gradeLevel, term: course.term, courses: [course] });
    }
    return [...buckets.values()];
  }, [filtered, sortKey]);

  const filtersActive =
    query !== "" ||
    yearFilter !== "all" ||
    termFilter !== "all" ||
    levelFilter !== "all" ||
    statusFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setYearFilter("all");
    setTermFilter("all");
    setLevelFilter("all");
    setStatusFilter("all");
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filteredReading = reading(filtered, settings, true, settings.simulate);

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Toolbar ------------------------------------------------------ */}
      <Card className="anim-rise p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <IconSearch
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search classes…"
              className="pl-9"
              aria-label="Search classes"
            />
          </div>

          <Button variant="solid" onClick={() => onAddClass()}>
            <IconPlus size={16} />
            Add class
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={String(yearFilter)}
            onChange={(event) =>
              setYearFilter(event.target.value === "all" ? "all" : (Number(event.target.value) as GradeLevel))
            }
            className="h-9 w-auto min-w-[7.5rem] text-[13px]"
            aria-label="Filter by grade level"
          >
            <option value="all">All years</option>
            {GRADE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {GRADE_NAMES[level]}
              </option>
            ))}
          </Select>

          <Select
            value={termFilter}
            onChange={(event) => setTermFilter(event.target.value as Term | "all")}
            className="h-9 w-auto min-w-[6.5rem] text-[13px]"
            aria-label="Filter by semester"
          >
            <option value="all">Both terms</option>
            {TERMS.map((term) => (
              <option key={term} value={term}>
                {termName(term)}
              </option>
            ))}
          </Select>

          <Segmented
            size="sm"
            value={levelFilter}
            onChange={setLevelFilter}
            ariaLabel="Filter by difficulty"
            options={[
              { value: "all", label: "All" },
              ...DIFFICULTIES.map((d) => ({ value: d as LevelFilter, label: d })),
            ]}
          />

          <Segmented
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter by grade status"
            options={[
              { value: "all", label: "Any" },
              { value: "graded", label: "Graded" },
              { value: "ungraded", label: "Open" },
            ]}
          />

          <Select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-9 w-auto min-w-[8.5rem] text-[13px]"
            aria-label="Sort"
          >
            <option value="chronological">By term</option>
            <option value="name">By name</option>
            <option value="grade-desc">Highest grade</option>
            <option value="grade-asc">Lowest grade</option>
            <option value="credits">Most credits</option>
          </Select>

          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}

          <span className="ml-auto text-[12.5px] text-ink-3">
            {pluralize(filtered.length, "class", "classes")}
            {filteredReading ? (
              <>
                {" · "}
                <b className="tnum font-semibold text-ink-2">
                  {formatGpa(filteredReading.gpa, settings.precision)}
                </b>{" "}
                wtd
              </>
            ) : null}
          </span>
        </div>
      </Card>

      {/* ---- Bulk bar ------------------------------------------------------ */}
      {selected.size > 0 ? (
        <div className="anim-pop sticky top-16 z-30 flex flex-wrap items-center gap-2 rounded-[12px] border border-brand/25 bg-brand-soft px-4 py-2.5">
          <span className="text-[13px] font-semibold text-brand">
            {pluralize(selected.size, "class", "classes")} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Deselect
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmBulk(true)}>
              <IconTrash size={14} />
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      {/* ---- List ---------------------------------------------------------- */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconClasses size={22} />}
            title={data.courses.length === 0 ? "No classes yet" : "Nothing matches those filters"}
            body={
              data.courses.length === 0
                ? "Add the courses on your schedule. Ungraded ones still count toward your credit plan and the target solver."
                : "Loosen a filter, or clear them all to see the full transcript again."
            }
            action={
              data.courses.length === 0 ? (
                <Button variant="solid" onClick={() => onAddClass()}>
                  <IconPlus size={16} />
                  Add a class
                </Button>
              ) : (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              )
            }
          />
        </Card>
      ) : grouped ? (
        <div className="flex flex-col gap-4">
          {grouped.map((bucket) => (
            <Card key={`${bucket.gradeLevel}-${bucket.term}`} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-2.5">
                <h2 className="text-[13.5px] font-bold text-ink">
                  {GRADE_NAMES[bucket.gradeLevel]} · {termName(bucket.term)}
                </h2>
                <TermPills courses={bucket.courses} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => onAddClass({ gradeLevel: bucket.gradeLevel, term: bucket.term })}
                >
                  <IconPlus size={14} />
                  Add here
                </Button>
              </div>

              <ClassTable
                courses={bucket.courses}
                selected={selected}
                onToggleSelected={toggleSelected}
                onEdit={onEditCourse}
              />
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <ClassTable
            courses={filtered}
            selected={selected}
            onToggleSelected={toggleSelected}
            onEdit={onEditCourse}
            showTerm
          />
        </Card>
      )}

      <ConfirmModal
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => {
          const ids = [...selected];
          dispatch({
            type: "delete-courses",
            ids,
            label: `delete ${pluralize(ids.length, "class", "classes")}`,
          });
          setSelected(new Set());
          toast(`Deleted ${pluralize(ids.length, "class", "classes")}.`, { tone: "neutral" });
        }}
        title={`Delete ${pluralize(selected.size, "class", "classes")}?`}
        confirmLabel="Delete them"
        body="They come off your transcript and out of every average. You can undo straight afterwards."
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Term summary pills                                                          */
/* -------------------------------------------------------------------------- */

function TermPills({ courses }: { courses: Course[] }) {
  const { settings } = useStore();
  const r = reading(courses, settings, true, settings.simulate);
  const credits = courses.reduce((sum, c) => sum + c.credits, 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {r ? (
        <Badge tone="brand">
          <span className="tnum">{formatGpa(r.gpa, settings.precision)}</span>
          <span className="font-medium">wtd</span>
        </Badge>
      ) : null}
      <Badge tone="outline">
        <span className="tnum">{trimZeros(credits.toFixed(2))}</span>
        <span className="font-medium">cr</span>
      </Badge>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

function ClassTable({
  courses,
  selected,
  onToggleSelected,
  onEdit,
  showTerm = false,
}: {
  courses: Course[];
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onEdit: (course: Course) => void;
  showTerm?: boolean;
}) {
  return (
    <>
      {/* Phones get stacked cards: a horizontally scrolling table hides the
          grade column, which is the one thing anyone came here to touch. */}
      <ul className="sm:hidden">
        {courses.map((course) => (
          <ClassCard
            key={course.id}
            course={course}
            selected={selected.has(course.id)}
            onToggleSelected={() => onToggleSelected(course.id)}
            onEdit={() => onEdit(course)}
            showTerm={showTerm}
          />
        ))}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="w-9 py-2 pl-4" aria-label="Select" />
            <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
              Class
            </th>
            {showTerm ? (
              <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
                Term
              </th>
            ) : null}
            <th className="py-2 pr-3 text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
              Level
            </th>
            <th className="py-2 pr-3 text-right text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
              Credits
            </th>
            <th className="py-2 pr-3 text-right text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
              Grade
            </th>
            <th className="py-2 pr-3 text-right text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase">
              Weighted
            </th>
            <th className="w-24 py-2 pr-4" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <ClassRow
              key={course.id}
              course={course}
              selected={selected.has(course.id)}
              onToggleSelected={() => onToggleSelected(course.id)}
              onEdit={() => onEdit(course)}
              showTerm={showTerm}
            />
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

/** The same row, restacked for a phone. */
function ClassCard({
  course,
  selected,
  onToggleSelected,
  onEdit,
  showTerm,
}: {
  course: Course;
  selected: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  showTerm: boolean;
}) {
  const { settings, dispatch } = useStore();
  const { toast } = useToast();

  const weighted = weightedPercent(course, settings, settings.simulate);
  const gpa = courseGpa(course, settings, true, settings.simulate);
  const simulated = settings.simulate && course.projected !== null;

  return (
    <li
      className={cx(
        "border-b border-line px-4 py-3 last:border-b-0",
        selected && "bg-brand-soft/50",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          aria-label={`Select ${course.name}`}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-solid)]"
        />

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onEdit}
            className="block w-full truncate text-left text-[14px] font-semibold text-ink"
          >
            {course.name}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
            <DifficultyBadge
              difficulty={course.difficulty}
              bump={settings.bumps[course.difficulty]}
            />
            <span>{course.subject}</span>
            <span>·</span>
            <span className="tnum">{trimZeros(course.credits.toFixed(2))} cr</span>
            {showTerm ? (
              <>
                <span>·</span>
                <span>
                  {course.gradeLevel}th {termName(course.term)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <GradeCell course={course} />
          <div
            className={cx(
              "tnum mt-0.5 text-[11px] font-semibold",
              simulated ? "text-warn" : "text-ink-3",
            )}
          >
            {weighted === null
              ? "ungraded"
              : `${trimZeros(weighted.toFixed(1))} · ${formatGpa(gpa, settings.precision)}`}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <IconEdit size={14} />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          onClick={() => dispatch({ type: "duplicate-course", id: course.id })}
          aria-label={`Duplicate ${course.name}`}
        >
          <IconCopy size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          className="hover:text-danger"
          onClick={() => {
            dispatch({ type: "delete-course", id: course.id });
            toast(`Deleted ${course.name}.`, { tone: "neutral" });
          }}
          aria-label={`Delete ${course.name}`}
        >
          <IconTrash size={14} />
        </Button>
      </div>
    </li>
  );
}

function ClassRow({
  course,
  selected,
  onToggleSelected,
  onEdit,
  showTerm,
}: {
  course: Course;
  selected: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  showTerm: boolean;
}) {
  const { data, settings, dispatch } = useStore();
  const { toast } = useToast();

  const effective = effectiveGrade(course, settings.simulate);
  const simulated = settings.simulate && course.projected !== null;
  const weighted = weightedPercent(course, settings, settings.simulate);
  const gpa = courseGpa(course, settings, true, settings.simulate);

  const paired = course.pairId
    ? data.courses.some((c) => c.pairId === course.pairId && c.id !== course.id)
    : false;

  const remove = () => {
    dispatch({ type: "delete-course", id: course.id });
    toast(`Deleted ${course.name}.`, { tone: "neutral" });
  };

  return (
    <tr
      className={cx(
        "group border-b border-line transition-colors last:border-b-0 hover:bg-surface-2",
        selected && "bg-brand-soft/50",
      )}
    >
      <td className="py-2 pl-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          aria-label={`Select ${course.name}`}
          className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-solid)]"
        />
      </td>

      <td className="py-2 pr-3">
        <button
          type="button"
          onClick={onEdit}
          className="max-w-[22ch] truncate text-left font-semibold text-ink transition-colors hover:text-brand sm:max-w-none"
          title={course.note || course.name}
        >
          {course.name}
        </button>
        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
          {course.subject}
          {paired ? (
            <span className="text-brand-2" title="Runs both semesters">
              · full year
            </span>
          ) : null}
        </div>
      </td>

      {showTerm ? (
        <td className="py-2 pr-3 text-[12px] whitespace-nowrap text-ink-2">
          {course.gradeLevel}th · {termName(course.term)}
        </td>
      ) : null}

      <td className="py-2 pr-3">
        <DifficultyBadge difficulty={course.difficulty} bump={settings.bumps[course.difficulty]} />
      </td>

      <td className="tnum py-2 pr-3 text-right text-ink-2">{trimZeros(course.credits.toFixed(2))}</td>

      <td className="py-2 pr-3 text-right">
        <GradeCell course={course} />
      </td>

      <td className="py-2 pr-3 text-right">
        {weighted === null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className={cx("tnum font-semibold", simulated ? "text-warn" : "text-brand")}>
            {trimZeros(weighted.toFixed(1))}
            <span className="ml-1.5 font-sans text-[11px] font-medium text-ink-3">
              {formatGpa(gpa, settings.precision)}
            </span>
          </span>
        )}
      </td>

      <td className="py-2 pr-4">
        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button size="sm" variant="ghost" iconOnly onClick={onEdit} title="Edit" aria-label={`Edit ${course.name}`}>
            <IconEdit size={15} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            onClick={() => dispatch({ type: "duplicate-course", id: course.id })}
            title="Duplicate"
            aria-label={`Duplicate ${course.name}`}
          >
            <IconCopy size={15} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            onClick={remove}
            title="Delete"
            aria-label={`Delete ${course.name}`}
            className="hover:text-danger"
          >
            <IconTrash size={15} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

/**
 * An editable grade cell.
 *
 * Click, type a number or a letter, press Enter. Escape restores. It writes
 * straight to the store, so the averages above update as the field blurs.
 */
function GradeCell({ course }: { course: Course }) {
  const { settings, dispatch } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const effective = effectiveGrade(course, settings.simulate);
  const simulated = settings.simulate && course.projected !== null && course.projected !== course.percent;

  const start = () => {
    setDraft(course.percent === null ? "" : String(course.percent));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = draft.trim() === "" ? null : parseGrade(draft);
    if (draft.trim() !== "" && parsed === null) return; // unparseable: leave it be
    if (parsed === course.percent) return;
    dispatch({
      type: "update-course",
      id: course.id,
      patch: { percent: parsed },
      label: `grade ${course.name}`,
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
        }}
        placeholder="—"
        aria-label={`Grade for ${course.name}`}
        className="tnum h-7 w-20 rounded-[7px] border border-brand-2 bg-surface px-2 text-right text-[13px] text-ink shadow-[var(--ring)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Click to edit"
      className={cx(
        "tnum inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-transparent px-2 font-semibold transition-colors hover:border-line-strong hover:bg-surface",
        course.percent === null ? "text-ink-3" : "text-ink",
      )}
    >
      {course.percent === null ? (
        simulated ? (
          <span className="text-warn">{trimZeros((course.projected ?? 0).toFixed(1))}*</span>
        ) : (
          "—"
        )
      ) : (
        <>
          {trimZeros(course.percent.toFixed(1))}
          <span className="font-sans text-[11px] font-medium text-ink-3">
            {percentToLetter(course.percent)}
          </span>
        </>
      )}
    </button>
  );
}
