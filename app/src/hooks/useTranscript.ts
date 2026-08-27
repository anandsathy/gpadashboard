import { useMemo } from "react";

import { useStore } from "@/store/StoreProvider";
import {
  averageBySubject,
  buildTrend,
  buildYearSummaries,
  creditsByDifficulty,
  reading,
  solveTarget,
  summarize,
  totalCredits,
} from "@/lib/gpa";
import type { Course, Reading, Settings, TrendPoint, YearSummary } from "@/lib/types";
import type { TargetResult } from "@/lib/gpa";

/**
 * Everything the pages read, computed once.
 *
 * The engine is cheap, but it is called from half a dozen places per render and
 * memoising here means a keystroke in the simulator re-runs it exactly once.
 */

export interface Transcript {
  courses: Course[];
  settings: Settings;
  simulate: boolean;

  weighted: Reading | null;
  unweighted: Reading | null;
  /** The same two, ignoring simulation — what is actually on the transcript. */
  realWeighted: Reading | null;
  realUnweighted: Reading | null;

  years: YearSummary[];
  trend: TrendPoint[];
  targetWeighted: TargetResult;
  targetUnweighted: TargetResult;

  gradedCount: number;
  ungradedCount: number;
  openCredits: number;
  earnedCredits: number;
  allCredits: number;
  mix: Record<"Regular" | "Honors" | "AP", number>;
  subjects: { subject: string; gpa: number; credits: number; courses: number }[];

  /** Change in cumulative weighted GPA across the last two graded terms. */
  momentum: number | null;
  hasAnyGrades: boolean;
  isEmpty: boolean;
}

export function useTranscript(): Transcript {
  const { data, settings } = useStore();
  const courses = data.courses;
  const simulate = settings.simulate;

  return useMemo(() => {
    const summary = summarize(courses, settings, simulate);
    const trend = buildTrend(courses, settings, simulate);

    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    const momentum =
      last?.cumulativeWeighted != null && prev?.cumulativeWeighted != null
        ? last.cumulativeWeighted - prev.cumulativeWeighted
        : null;

    return {
      courses,
      settings,
      simulate,

      weighted: summary.weighted,
      unweighted: summary.unweighted,
      realWeighted: reading(courses, settings, true, false),
      realUnweighted: reading(courses, settings, false, false),

      years: buildYearSummaries(courses, settings, simulate),
      trend,
      targetWeighted: solveTarget(courses, settings, true, simulate),
      targetUnweighted: solveTarget(courses, settings, false, simulate),

      gradedCount: summary.gradedCount,
      ungradedCount: summary.ungradedCount,
      openCredits: summary.openCredits,
      earnedCredits: summary.weighted?.credits ?? 0,
      allCredits: totalCredits(courses),
      mix: creditsByDifficulty(courses),
      subjects: averageBySubject(courses, settings, true, simulate),

      momentum,
      hasAnyGrades: summary.gradedCount > 0,
      isEmpty: courses.length === 0,
    };
  }, [courses, settings, simulate]);
}
