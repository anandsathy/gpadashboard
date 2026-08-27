import { useMemo, useState } from "react";

import { useStore } from "@/store/StoreProvider";
import { useTranscript } from "@/hooks/useTranscript";
import { formatDelta, formatGpa, pluralize, trimZeros } from "@/lib/format";
import {
  GRADE_NAMES,
  buildTrend,
  reading,
  solveForCourse,
  sortCourses,
  termName,
} from "@/lib/gpa";
import { clamp, parseGrade, percentToLetter } from "@/lib/scale";
import type { Course } from "@/lib/types";
import { TrendChart, TrendLegend } from "@/components/charts/TrendChart";
import { IconSimulate, IconSparkle, IconTarget, IconTrash } from "@/components/ui/Icons";
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  CardHeader,
  DifficultyBadge,
  EmptyState,
  Switch,
  cx,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/**
 * The what-if tool.
 *
 * The contract with the student is the whole design: a projected grade lives in
 * its own field on the course and never touches the recorded one. Turning
 * simulation off restores the real transcript exactly, with nothing to undo.
 */

export function Simulate({ onAddClass }: { onAddClass: () => void }) {
  const { data, settings, dispatch } = useStore();
  const { toast } = useToast();
  const t = useTranscript();

  const [scope, setScope] = useState<"open" | "all">("open");

  const simulating = settings.simulate;

  /* Both futures, computed side by side. */
  const comparison = useMemo(() => {
    const real = reading(data.courses, settings, true, false);
    const projected = reading(data.courses, settings, true, true);
    const realUn = reading(data.courses, settings, false, false);
    const projectedUn = reading(data.courses, settings, false, true);

    return {
      real,
      projected,
      realUn,
      projectedUn,
      delta: real && projected ? projected.gpa - real.gpa : null,
      deltaUn: realUn && projectedUn ? projectedUn.gpa - realUn.gpa : null,
    };
  }, [data.courses, settings]);

  const projectedTrend = useMemo(
    () => buildTrend(data.courses, settings, true),
    [data.courses, settings],
  );

  const visible = useMemo(() => {
    const list = scope === "all" ? data.courses : data.courses.filter((c) => c.percent === null);
    return sortCourses(list);
  }, [data.courses, scope]);

  const withProjection = data.courses.filter((c) => c.projected !== null).length;

  const fillAll = (percent: number, label: string) => {
    const targets = scope === "all" ? data.courses : data.courses.filter((c) => c.percent === null);
    if (targets.length === 0) {
      toast("Nothing to fill in.", { tone: "neutral" });
      return;
    }
    for (const course of targets) {
      dispatch({ type: "set-projected", id: course.id, projected: percent });
    }
    if (!simulating) dispatch({ type: "update-settings", patch: { simulate: true } });
    toast(`Filled ${pluralize(targets.length, "class", "classes")} with ${label}.`, { tone: "good" });
  };

  if (t.isEmpty) {
    return (
      <Card className="anim-rise mt-6">
        <EmptyState
          icon={<IconSimulate size={22} />}
          title="Nothing to simulate yet"
          body="Add the classes you're taking — even without grades — and this page will let you try hypothetical results and watch the projected GPA move in real time."
          action={
            <Button variant="solid" size="lg" onClick={onAddClass}>
              Add a class
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="stagger flex flex-col gap-4 sm:gap-5">
      {/* ---- The switch ---------------------------------------------------- */}
      <Card
        className={cx(
          "p-4 sm:p-5 transition-colors",
          simulating && "border-warn/40 bg-warn-soft/40",
        )}
      >
        <div className="flex flex-wrap items-center gap-4">
          <Switch
            checked={simulating}
            onChange={(next) => dispatch({ type: "update-settings", patch: { simulate: next } })}
            label="Simulation mode"
            hint={
              simulating
                ? "Every total in the app currently includes your hypothetical grades."
                : "Off — the dashboard shows only grades you have actually been given."
            }
          />

          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => fillAll(95, "an A")}>
              Fill with A
            </Button>
            <Button size="sm" variant="outline" onClick={() => fillAll(88, "a B+")}>
              Fill with B+
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                dispatch({ type: "seed-projections" });
                toast("Copied your current grades into the simulation.", { tone: "neutral" });
              }}
              title="Start from what you already have"
            >
              <IconSparkle size={14} />
              Match current
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={withProjection === 0}
              onClick={() => {
                dispatch({ type: "clear-projections" });
                toast("Cleared every hypothetical grade.", { tone: "neutral" });
              }}
            >
              <IconTrash size={14} />
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- Comparison ---------------------------------------------------- */}
      <section className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="p-5">
          <span className="eyebrow">Projected vs actual</span>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                Actual
              </div>
              <div className="tnum mt-1 text-[34px] leading-none font-semibold text-ink-2">
                {formatGpa(comparison.real?.gpa, settings.precision)}
              </div>
              <div className="mt-1 text-[11.5px] text-ink-3">
                {trimZeros((comparison.real?.credits ?? 0).toFixed(2))} credits
              </div>
            </div>

            <div>
              <div className="text-[11px] font-bold tracking-[0.08em] text-warn uppercase">
                Projected
              </div>
              <div className="tnum mt-1 text-[34px] leading-none font-semibold text-warn">
                <AnimatedNumber
                  value={comparison.projected?.gpa ?? null}
                  decimals={settings.precision}
                />
              </div>
              <div className="mt-1 text-[11.5px] text-ink-3">
                {trimZeros((comparison.projected?.credits ?? 0).toFixed(2))} credits
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-line-strong pt-4">
            <Badge
              tone={
                comparison.delta === null || Math.abs(comparison.delta) < 0.005
                  ? "neutral"
                  : comparison.delta > 0
                    ? "brand"
                    : "warn"
              }
            >
              <span className="tnum">{formatDelta(comparison.delta, settings.precision)}</span>
              <span className="font-medium">weighted</span>
            </Badge>
            <Badge tone="neutral">
              <span className="tnum">{formatDelta(comparison.deltaUn, settings.precision)}</span>
              <span className="font-medium">unweighted</span>
            </Badge>
            <span className="text-[12px] text-ink-3">
              {withProjection === 0
                ? "No hypothetical grades set yet."
                : `${pluralize(withProjection, "class", "classes")} carrying one.`}
            </span>
          </div>

          {!simulating && withProjection > 0 ? (
            <p className="mt-3 rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-ink-2">
              Simulation is off, so the rest of the app still shows{" "}
              <b className="tnum">{formatGpa(comparison.real?.gpa, settings.precision)}</b>. Turn it
              on above to carry these numbers through the dashboard.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Where the projection lands"
            hint="Cumulative weighted GPA with every hypothetical grade applied."
          />
          <div className="px-2 pb-2">
            <TrendChart
              points={projectedTrend}
              series="cumulative"
              target={settings.targetWeighted}
              precision={settings.precision}
              height={222}
              still
            />
          </div>
          <div className="border-t border-line px-5 py-2.5">
            <TrendLegend />
          </div>
        </Card>
      </section>

      {/* ---- The classes --------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Hypothetical grades"
          hint="Drag or type. Nothing here is written to your transcript."
          action={
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={scope === "open" ? "solid" : "outline"}
                onClick={() => setScope("open")}
              >
                Ungraded
              </Button>
              <Button
                size="sm"
                variant={scope === "all" ? "solid" : "outline"}
                onClick={() => setScope("all")}
              >
                All classes
              </Button>
            </div>
          }
        />

        <div className="border-t border-line">
          {visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13.5px] text-ink-3">
              Every class already has a grade. Switch to “All classes” to try changing one.
            </p>
          ) : (
            visible.map((course) => <SimRow key={course.id} course={course} />)
          )}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One simulated course                                                        */
/* -------------------------------------------------------------------------- */

function SimRow({ course }: { course: Course }) {
  const { data, settings, dispatch } = useStore();
  const [text, setText] = useState<string | null>(null);

  const value = course.projected;
  const bump = settings.bumps[course.difficulty] ?? 0;

  const needed = useMemo(
    () => solveForCourse(data.courses, course, settings, true, settings.simulate),
    [data.courses, course, settings],
  );

  const set = (next: number | null) =>
    dispatch({ type: "set-projected", id: course.id, projected: next });

  const commitText = () => {
    if (text === null) return;
    const parsed = text.trim() === "" ? null : parseGrade(text);
    setText(null);
    if (text.trim() !== "" && parsed === null) return;
    set(parsed);
  };

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] sm:px-5">
      {/* Identity */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <DifficultyBadge difficulty={course.difficulty} bump={bump} />
          <span className="truncate text-[13.5px] font-semibold text-ink">{course.name}</span>
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-3">
          {GRADE_NAMES[course.gradeLevel]} · {termName(course.term)} ·{" "}
          {trimZeros(course.credits.toFixed(2))} cr
          {course.percent !== null ? (
            <span className="text-ink-2"> · recorded {trimZeros(course.percent.toFixed(1))}</span>
          ) : null}
        </div>
      </div>

      {/* Slider */}
      <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
        <input
          type="range"
          min={50}
          max={100}
          step={0.5}
          value={value ?? course.percent ?? 85}
          onChange={(event) => set(Number(event.target.value))}
          aria-label={`Hypothetical grade for ${course.name}`}
          className={cx(
            "h-1.5 w-full cursor-pointer appearance-none rounded-full",
            value === null ? "accent-[var(--ink-3)] opacity-55" : "accent-[var(--brand-solid)]",
          )}
          style={{
            // An unset slider shows a plain track: a green fill would imply a
            // projection that has not actually been made yet.
            background:
              value === null
                ? "var(--surface-3)"
                : `linear-gradient(90deg, var(--brand-2) ${((value - 50) / 50) * 100}%, var(--surface-3) 0%)`,
          }}
        />
      </div>

      {/* Value + helpers */}
      <div className="flex items-center justify-end gap-2">
        <div className="text-right">
          <input
            value={text ?? (value === null ? "" : trimZeros(value.toFixed(1)))}
            onChange={(event) => setText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              }
            }}
            placeholder="—"
            inputMode="decimal"
            aria-label={`Hypothetical grade value for ${course.name}`}
            className={cx(
              "tnum h-8 w-[4.5rem] rounded-[8px] border border-line-strong bg-surface px-2 text-right text-[13.5px] font-semibold outline-none",
              "focus:border-brand-2 focus:shadow-[var(--ring)]",
              value === null ? "text-ink-3" : "text-warn",
            )}
          />
          <div className="mt-0.5 h-4 text-[10.5px] font-semibold text-ink-3">
            {value === null ? (
              needed !== null && needed <= 100 && needed > 0 ? (
                <button
                  type="button"
                  onClick={() => set(clamp(Math.ceil(needed * 10) / 10, 0, 100))}
                  className="inline-flex items-center gap-1 text-brand transition-colors hover:underline"
                  title={`Set this class to the grade that reaches your target GPA`}
                >
                  <IconTarget size={10} />
                  need {trimZeros(needed.toFixed(1))}
                </button>
              ) : null
            ) : (
              <>
                {percentToLetter(value)} · wtd {trimZeros((value + bump).toFixed(1))}
              </>
            )}
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          iconOnly
          disabled={value === null}
          onClick={() => set(null)}
          title="Clear this projection"
          aria-label={`Clear the hypothetical grade for ${course.name}`}
        >
          <IconTrash size={14} />
        </Button>
      </div>
    </div>
  );
}
