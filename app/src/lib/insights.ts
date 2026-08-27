import { formatGpa, formatDelta, pluralize, trimZeros } from "./format";
import {
  averageBySubject,
  buildTrend,
  courseImpact,
  creditsByDifficulty,
  effectiveGrade,
  reading,
  solveTarget,
  totalCredits,
  termLabel,
} from "./gpa";
import { percentToLetter } from "./scale";
import type { Course, Settings } from "./types";

/**
 * The insights engine.
 *
 * It reads the same numbers the dashboard shows and says something useful about
 * them in a sentence. Every rule is opt-in on real evidence — nothing fires on
 * an empty transcript, and nothing invents encouragement it cannot support.
 */

export type InsightTone = "good" | "warn" | "info" | "neutral";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  /** Higher sorts first. */
  weight: number;
}

/** A rough diploma requirement, used only to give the credits bar a scale. */
export const DIPLOMA_CREDITS = 24;

export function buildInsights(
  courses: readonly Course[],
  settings: Settings,
  simulate: boolean,
): Insight[] {
  const out: Insight[] = [];
  const push = (i: Insight) => out.push(i);

  const graded = courses.filter((c) => effectiveGrade(c, simulate) !== null);
  if (graded.length === 0) {
    return [
      {
        id: "empty",
        tone: "neutral",
        title: "Nothing to read yet",
        body: "Add a class with a grade and this page fills in with trends, subject strengths, and what you need from here.",
        weight: 100,
      },
    ];
  }

  const weighted = reading(courses, settings, true, simulate);
  const unweighted = reading(courses, settings, false, simulate);
  const trend = buildTrend(courses, settings, simulate);
  const p = settings.precision;

  /* ---- momentum ---------------------------------------------------------- */
  if (trend.length >= 2) {
    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    if (last?.cumulativeWeighted != null && prev?.cumulativeWeighted != null) {
      const delta = last.cumulativeWeighted - prev.cumulativeWeighted;
      const moved = Math.abs(delta) >= 0.005;
      push({
        id: "momentum",
        tone: !moved ? "neutral" : delta > 0 ? "good" : "warn",
        title: !moved
          ? "Holding steady"
          : delta > 0
            ? `Up ${formatDelta(delta, p).replace("+", "")} since last term`
            : `Down ${formatDelta(delta, p).replace("−", "")} since last term`,
        body: !moved
          ? `Your cumulative weighted GPA barely moved through ${last.label} — it sits at ${formatGpa(last.cumulativeWeighted, p)}.`
          : `Cumulative weighted GPA went from ${formatGpa(prev.cumulativeWeighted, p)} after ${prev.label} to ${formatGpa(last.cumulativeWeighted, p)} after ${last.label}.`,
        weight: 90,
      });
    }

    /* ---- best and worst term -------------------------------------------- */
    const rated = trend.filter((t) => t.weighted != null);
    if (rated.length >= 2) {
      const best = rated.reduce((a, b) => ((b.weighted ?? 0) > (a.weighted ?? 0) ? b : a));
      const worst = rated.reduce((a, b) => ((b.weighted ?? 0) < (a.weighted ?? 0) ? b : a));
      if (best.key !== worst.key) {
        push({
          id: "range",
          tone: "info",
          title: `${best.label} was your strongest term`,
          body: `It averaged ${formatGpa(best.weighted, p)} weighted. Your lowest was ${worst.label} at ${formatGpa(worst.weighted, p)} — a spread of ${formatGpa((best.weighted ?? 0) - (worst.weighted ?? 0), p)}.`,
          weight: 60,
        });
      }
    }
  }

  /* ---- the target -------------------------------------------------------- */
  const target = solveTarget(courses, settings, true, simulate);
  if (target.met) {
    push({
      id: "target-met",
      tone: "good",
      title: `You are past your ${formatGpa(target.target, p)} target`,
      body:
        target.remainingCredits > 0
          ? `Averaging ${trimZeros((target.requiredPercent ?? 0).toFixed(1))}% or better across your remaining ${trimZeros(target.remainingCredits.toFixed(2))} credits keeps you there.`
          : `Every credit on your transcript is graded, and the cumulative weighted GPA finished at ${formatGpa(target.current, p)}.`,
      weight: 95,
    });
  } else if (target.outOfRoad) {
    push({
      id: "target-closed",
      tone: "warn",
      title: "No ungraded credits left",
      body: `The cumulative weighted GPA settled at ${formatGpa(target.current, p)}, short of the ${formatGpa(target.target, p)} target. Adding next semester's classes reopens the math.`,
      weight: 95,
    });
  } else if (!target.achievable) {
    push({
      id: "target-unreachable",
      tone: "warn",
      title: "The target is out of reach on current credits",
      body: `Hitting ${formatGpa(target.target, p)} would take a ${trimZeros((target.requiredPercent ?? 0).toFixed(1))}% average across the ${trimZeros(target.remainingCredits.toFixed(2))} credits still open. Add more coursework or nudge the target in Settings.`,
      weight: 96,
    });
  } else if (target.requiredPercent !== null) {
    const need = target.requiredPercent;
    push({
      id: "target-path",
      tone: need >= 97 ? "warn" : "info",
      title: `Average ${trimZeros(need.toFixed(1))}% to reach ${formatGpa(target.target, p)}`,
      body: `That is across the ${trimZeros(target.remainingCredits.toFixed(2))} credits you have not been graded on yet${target.remainingBump > 0 ? `, and it already accounts for the ${trimZeros(target.remainingBump.toFixed(1))}-point average bump those courses carry` : ""}. In letters, roughly ${percentToLetter(need)}.`,
      weight: 94,
    });
  }

  /* ---- what the weighting is worth --------------------------------------- */
  if (weighted && unweighted) {
    const gap = weighted.gpa - unweighted.gpa;
    if (gap >= 0.01) {
      push({
        id: "weighting",
        tone: "info",
        title: `Course rigor is worth ${formatGpa(gap, p)} to you`,
        body: `Weighted ${formatGpa(weighted.gpa, p)} against unweighted ${formatGpa(unweighted.gpa, p)}. That gap is the Honors and AP bump showing up in the average.`,
        weight: 70,
      });
    }
  }

  /* ---- rigor mix --------------------------------------------------------- */
  const mix = creditsByDifficulty(courses);
  const all = totalCredits(courses);
  const advanced = mix.AP + mix.Honors;
  if (all > 0 && advanced > 0) {
    const share = Math.round((advanced / all) * 100);
    push({
      id: "rigor",
      tone: "neutral",
      title: `${share}% of your credits are Honors or AP`,
      body: `${trimZeros(mix.AP.toFixed(2))} AP and ${trimZeros(mix.Honors.toFixed(2))} Honors credits out of ${trimZeros(all.toFixed(2))} total.`,
      weight: 45,
    });
  }

  /* ---- subject strengths ------------------------------------------------- */
  const bySubject = averageBySubject(courses, settings, true, simulate).filter(
    (s) => s.credits > 0,
  );
  if (bySubject.length >= 2) {
    const best = bySubject[0];
    const worst = bySubject[bySubject.length - 1];
    if (best && worst && best.gpa - worst.gpa >= 0.15) {
      push({
        id: "subjects",
        tone: "info",
        title: `${best.subject} is carrying you`,
        body: `It averages ${formatGpa(best.gpa, p)} weighted across ${pluralize(best.courses, "course")}, while ${worst.subject} sits at ${formatGpa(worst.gpa, p)}.`,
        weight: 65,
      });
    }
  }

  /* ---- the class that matters most --------------------------------------- */
  const open = courses.filter((c) => effectiveGrade(c, simulate) === null && c.credits > 0);
  if (open.length > 0) {
    const heaviest = open.reduce((a, b) => (b.credits > a.credits ? b : a));
    push({
      id: "heaviest-open",
      tone: "neutral",
      title: `${heaviest.name} is your heaviest ungraded class`,
      body: `${trimZeros(heaviest.credits.toFixed(2))} credits of ${heaviest.difficulty} coursework in ${termLabel(heaviest.gradeLevel, heaviest.term)}. It moves the cumulative average more than anything else still open.`,
      weight: 55,
    });
  }

  /* ---- the class dragging hardest ---------------------------------------- */
  if (graded.length >= 3 && weighted) {
    const drags = graded
      .map((c) => ({ course: c, impact: courseImpact(courses, c, settings, simulate) }))
      .sort((a, b) => a.impact - b.impact);
    const worst = drags[0];
    if (worst && worst.impact < -0.01) {
      const g = effectiveGrade(worst.course, simulate);
      push({
        id: "drag",
        tone: "warn",
        title: `${worst.course.name} pulls the average down ${formatGpa(Math.abs(worst.impact), p)}`,
        body: `It is recorded at ${trimZeros((g ?? 0).toFixed(1))}% (${percentToLetter(g ?? 0)}). Drop it from the calculation and the cumulative weighted GPA rises to ${formatGpa(weighted.gpa - worst.impact, p)}.`,
        weight: 68,
      });
    }
  }

  /* ---- honor roll -------------------------------------------------------- */
  if (weighted) {
    const milestones: { at: number; name: string }[] = [
      { at: 3.5, name: "Honor Roll" },
      { at: 3.8, name: "High Honors" },
      { at: 4.0, name: "a 4.0" },
      { at: 4.3, name: "a 4.3 weighted average" },
    ];
    const next = milestones.find((m) => weighted.gpa < m.at);
    const cleared = [...milestones].reverse().find((m) => weighted.gpa >= m.at);

    if (cleared) {
      push({
        id: "milestone-cleared",
        tone: "good",
        title: `Clear of ${cleared.name}`,
        body: `A weighted ${formatGpa(weighted.gpa, p)} is above the ${cleared.at.toFixed(1)} line.`,
        weight: 50,
      });
    }
    if (next) {
      push({
        id: "milestone-next",
        tone: "neutral",
        title: `${formatGpa(next.at - weighted.gpa, p)} from ${next.name}`,
        body: `You are at ${formatGpa(weighted.gpa, p)} weighted; ${next.at.toFixed(1)} is the next line worth crossing.`,
        weight: 48,
      });
    }
  }

  /* ---- credits toward a diploma ------------------------------------------ */
  const earned = graded.reduce((s, c) => s + (c.credits > 0 ? c.credits : 0), 0);
  if (earned > 0) {
    const pct = Math.min(100, Math.round((earned / DIPLOMA_CREDITS) * 100));
    push({
      id: "credits",
      tone: "neutral",
      title: `${trimZeros(earned.toFixed(2))} credits graded`,
      body: `Roughly ${pct}% of a ${DIPLOMA_CREDITS}-credit diploma, if your school uses that total. Adjust the comparison in your head — the app does not know your exact requirement.`,
      weight: 30,
    });
  }

  /* ---- simulation ---------------------------------------------------------*/
  if (simulate) {
    const real = reading(courses, settings, true, false);
    if (real && weighted) {
      const delta = weighted.gpa - real.gpa;
      push({
        id: "sim",
        tone: Math.abs(delta) < 0.005 ? "neutral" : delta > 0 ? "good" : "warn",
        title: `Simulation moves you ${formatDelta(delta, p)}`,
        body: `Your saved grades give ${formatGpa(real.gpa, p)} weighted. With the hypothetical grades applied it reads ${formatGpa(weighted.gpa, p)}. Nothing here is saved to your transcript.`,
        weight: 99,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}
