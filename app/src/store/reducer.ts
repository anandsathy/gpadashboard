import { defaultData, makeCourse, type NewCourseInput } from "@/lib/defaults";
import { uid } from "@/lib/id";
import type { AppData, Course, Settings } from "@/lib/types";

/**
 * The store, as a reducer.
 *
 * Every edit runs through here, which buys two things for free: a single place
 * that stamps `updatedAt` (so sync knows what changed), and a complete
 * undo history, because "before" is always available at the moment of the edit.
 */

export interface HistoryEntry {
  data: AppData;
  /** What the action did, phrased for an "Undo <label>" button. */
  label: string;
}

export interface StoreState {
  data: AppData;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** False until storage has been read once — keeps the UI from flashing empty. */
  ready: boolean;
  /** Bumped whenever a change should be pushed to the cloud. */
  revision: number;
}

export type Action =
  /** Replace everything, from disk or from the cloud. Not undoable. */
  | { type: "hydrate"; data: AppData; ready?: boolean }
  | { type: "add-course"; input: NewCourseInput }
  | { type: "add-courses"; courses: Course[]; label?: string }
  /** A year-long course: one row per semester, linked by `pairId`. */
  | { type: "add-year-long"; input: NewCourseInput }
  | { type: "update-course"; id: string; patch: Partial<Course>; label?: string }
  /** Applies a patch to a course and to its paired semester, if it has one. */
  | { type: "update-course-pair"; id: string; patch: Partial<Course> }
  | { type: "delete-course"; id: string }
  | { type: "delete-courses"; ids: string[]; label?: string }
  | { type: "duplicate-course"; id: string }
  | { type: "set-projected"; id: string; projected: number | null }
  | { type: "clear-projections" }
  /** Copies every recorded grade into the projection slots as a starting point. */
  | { type: "seed-projections" }
  | { type: "update-settings"; patch: Partial<Settings> }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 60;

export function initialState(): StoreState {
  return { data: defaultData(), past: [], future: [], ready: false, revision: 0 };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Records the pre-change state and clears the redo stack. */
function commit(state: StoreState, label: string, next: AppData): StoreState {
  const past = [...state.past, { data: state.data, label }];
  return {
    ...state,
    data: { ...next, updatedAt: Date.now() },
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
    revision: state.revision + 1,
  };
}

const withCourses = (data: AppData, courses: Course[]): AppData => ({ ...data, courses });

function patchCourse(course: Course, patch: Partial<Course>): Course {
  return { ...course, ...patch, id: course.id, updatedAt: Date.now() };
}

/** Fields that travel between the two halves of a year-long course. */
const SHARED_FIELDS = ["name", "subject", "difficulty", "gradeLevel", "note"] as const;

function sharedPart(patch: Partial<Course>): Partial<Course> {
  const out: Partial<Course> = {};
  for (const key of SHARED_FIELDS) {
    if (key in patch) {
      // Each field is copied by name so a stray key can never leak across.
      (out as Record<string, unknown>)[key] = patch[key];
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Reducer                                                                     */
/* -------------------------------------------------------------------------- */

export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        data: action.data,
        past: [],
        future: [],
        ready: action.ready ?? true,
      };

    case "add-course": {
      const course = makeCourse(action.input);
      return commit(state, `add ${course.name}`, withCourses(state.data, [...state.data.courses, course]));
    }

    case "add-courses": {
      if (action.courses.length === 0) return state;
      const label = action.label ?? `add ${action.courses.length} classes`;
      return commit(state, label, withCourses(state.data, [...state.data.courses, ...action.courses]));
    }

    case "add-year-long": {
      // Two rows, one per semester, sharing an id so edits stay in step. The
      // credits given are for the whole year and split evenly.
      const pairId = uid();
      const half = (action.input.credits ?? 1) / 2;
      const fall = makeCourse({ ...action.input, term: "S1", credits: half, pairId });
      const spring = makeCourse({
        ...action.input,
        term: "S2",
        credits: half,
        pairId,
        percent: null, // only the fall grade is known when a year-long is added
        projected: null,
      });
      return commit(
        state,
        `add ${fall.name}`,
        withCourses(state.data, [...state.data.courses, fall, spring]),
      );
    }

    case "update-course": {
      const target = state.data.courses.find((c) => c.id === action.id);
      if (!target) return state;
      return commit(
        state,
        action.label ?? `edit ${target.name}`,
        withCourses(
          state.data,
          state.data.courses.map((c) => (c.id === action.id ? patchCourse(c, action.patch) : c)),
        ),
      );
    }

    case "update-course-pair": {
      const target = state.data.courses.find((c) => c.id === action.id);
      if (!target) return state;
      const shared = sharedPart(action.patch);

      return commit(
        state,
        `edit ${target.name}`,
        withCourses(
          state.data,
          state.data.courses.map((c) => {
            if (c.id === action.id) return patchCourse(c, action.patch);
            // The sibling gets the shared fields only: each semester keeps its
            // own grade, credits, and projection.
            if (target.pairId && c.pairId === target.pairId) return patchCourse(c, shared);
            return c;
          }),
        ),
      );
    }

    case "delete-course": {
      const target = state.data.courses.find((c) => c.id === action.id);
      if (!target) return state;
      return commit(
        state,
        `delete ${target.name}`,
        withCourses(state.data, state.data.courses.filter((c) => c.id !== action.id)),
      );
    }

    case "delete-courses": {
      const ids = new Set(action.ids);
      if (ids.size === 0) return state;
      const label = action.label ?? `delete ${ids.size} classes`;
      return commit(
        state,
        label,
        withCourses(state.data, state.data.courses.filter((c) => !ids.has(c.id))),
      );
    }

    case "duplicate-course": {
      const target = state.data.courses.find((c) => c.id === action.id);
      if (!target) return state;
      const copy = makeCourse({
        name: `${target.name} (copy)`,
        subject: target.subject,
        gradeLevel: target.gradeLevel,
        term: target.term,
        credits: target.credits,
        difficulty: target.difficulty,
        percent: target.percent,
        note: target.note,
      });
      return commit(
        state,
        `duplicate ${target.name}`,
        withCourses(state.data, [...state.data.courses, copy]),
      );
    }

    case "set-projected": {
      const target = state.data.courses.find((c) => c.id === action.id);
      if (!target) return state;
      // Projections change constantly while a student drags a slider, so they
      // deliberately do not each get their own undo entry.
      return {
        ...state,
        data: {
          ...state.data,
          courses: state.data.courses.map((c) =>
            c.id === action.id ? { ...c, projected: action.projected } : c,
          ),
          updatedAt: Date.now(),
        },
        revision: state.revision + 1,
      };
    }

    case "clear-projections": {
      const hasAny = state.data.courses.some((c) => c.projected !== null);
      if (!hasAny) return state;
      return commit(
        state,
        "clear the simulation",
        withCourses(
          state.data,
          state.data.courses.map((c) => (c.projected === null ? c : { ...c, projected: null })),
        ),
      );
    }

    case "seed-projections":
      return commit(
        state,
        "seed the simulation",
        withCourses(
          state.data,
          state.data.courses.map((c) => ({ ...c, projected: c.projected ?? c.percent })),
        ),
      );

    case "update-settings":
      return commit(state, "change settings", {
        ...state.data,
        settings: { ...state.data.settings, ...action.patch },
      });

    case "reset":
      return commit(state, "erase everything", {
        ...defaultData(),
        // A reset clears coursework, not preferences — losing your target GPA
        // and theme because you cleared a transcript would be obnoxious.
        settings: state.data.settings,
      });

    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        data: previous.data,
        past: state.past.slice(0, -1),
        future: [{ data: state.data, label: previous.label }, ...state.future],
        revision: state.revision + 1,
      };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        data: next.data,
        past: [...state.past, { data: state.data, label: next.label }],
        future: state.future.slice(1),
        revision: state.revision + 1,
      };
    }

    default:
      return state;
  }
}
