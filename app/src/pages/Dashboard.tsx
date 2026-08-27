import { useMemo, useState } from "react";

import { useStore } from "@/store/StoreProvider";
import { useTranscript } from "@/hooks/useTranscript";
import { sampleCourses } from "@/lib/defaults";
import { SCALE_SUFFIX, formatDelta, formatGpa, formatScaleValue, pluralize, trimZeros } from "@/lib/format";
import { GRADE_NAMES, termName } from "@/lib/gpa";
import { percentToLetter } from "@/lib/scale";
import type { Reading, Scale } from "@/lib/types";
import type { Route } from "@/router";
import { Donut, DonutLegend, BarChart, Sparkline } from "@/components/charts/MiniCharts";
import { Gauge } from "@/components/charts/Gauge";
import { TrendChart, TrendLegend, type TrendSeries } from "@/components/charts/TrendChart";
import {
  IconArrowDown,
  IconArrowUp,
  IconClasses,
  IconPlus,
  IconSparkle,
  IconTarget,
} from "@/components/ui/Icons";
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  CardHeader,
  DifficultyBadge,
  EmptyState,
  Progress,
  Segmented,
  cx,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/**
 * The dashboard: where things stand, in one screen.
 *
 * Reading order is deliberate — the two numbers a student actually wants, then
 * the shape of the trend, then how far from the goal, then the detail.
 */

export function Dashboard({
  onNavigate,
  onAddClass,
}: {
  onNavigate: (route: Route) => void;
  onAddClass: () => void;
}) {
  const t = useTranscript();
  const { settings, replaceAll, data } = useStore();
  const { toast } = useToast();

  const [scale, setScale] = useState<Scale>("gpa");
  const [series, setSeries] = useState<TrendSeries>("cumulative");

  const cumulativeSparkline = useMemo(
    () => t.trend.map((point) => point.cumulativeWeighted),
    [t.trend],
  );

  if (t.isEmpty) {
    return (
      <Card className="anim-rise mt-6">
        <EmptyState
          icon={<IconClasses size={22} />}
          title="Let's build your transcript"
          body="Add the classes on your schedule — name, credits, difficulty, and a grade if you have one. Weighted and unweighted GPA appear the moment the first grade lands."
          action={
            <>
              <Button variant="solid" size="lg" onClick={onAddClass}>
                <IconPlus size={16} />
                Add your first class
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  replaceAll(
                    { ...data, courses: sampleCourses(), updatedAt: Date.now() },
                    "Loaded a sample transcript — clear it any time from Settings.",
                  );
                }}
              >
                <IconSparkle size={16} />
                Try sample data
              </Button>
            </>
          }
        />
      </Card>
    );
  }

  return (
    <div className="stagger flex flex-col gap-4 sm:gap-5">
      {/* ---- Headline readouts ------------------------------------------- */}
      <section className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-4">
          <ReadoutCard
            eyebrow="Cumulative weighted"
            reading={t.weighted}
            scale={scale}
            onScaleChange={setScale}
            momentum={t.momentum}
            sparkline={cumulativeSparkline}
            primary
            simulated={t.simulate && t.realWeighted?.gpa !== t.weighted?.gpa}
            realValue={t.realWeighted}
          />
          <ReadoutCard
            eyebrow="Cumulative unweighted"
            reading={t.unweighted}
            scale={scale}
            momentum={null}
            sparkline={t.trend.map((p) => p.cumulativeUnweighted)}
            simulated={t.simulate && t.realUnweighted?.gpa !== t.unweighted?.gpa}
            realValue={t.realUnweighted}
          />
        </div>

        {/* ---- Trend ----------------------------------------------------- */}
        <Card className="flex min-h-[300px] flex-col">
          <CardHeader
            title="GPA over time"
            hint={
              t.trend.length < 2
                ? "One graded term so far — the line fills in as you go."
                : `${pluralize(t.trend.length, "graded term")} on record.`
            }
            action={
              <Segmented
                size="sm"
                value={series}
                onChange={setSeries}
                ariaLabel="Trend series"
                options={[
                  { value: "cumulative", label: "Cumulative" },
                  { value: "term", label: "By term" },
                ]}
              />
            }
          />
          <div className="px-2 pb-2">
            <TrendChart
              points={t.trend}
              series={series}
              target={settings.targetWeighted}
              precision={settings.precision}
              height={252}
            />
          </div>
          <div className="border-t border-line px-5 py-2.5">
            <TrendLegend />
          </div>
        </Card>
      </section>

      {/* ---- Target + stats ----------------------------------------------- */}
      <section className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <TargetCard onNavigate={onNavigate} />

        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Credits graded"
            value={trimZeros(t.earnedCredits.toFixed(2))}
            hint={`${trimZeros(t.openCredits.toFixed(2))} still open`}
          />
          <StatTile
            label="Classes"
            value={String(t.gradedCount)}
            hint={t.ungradedCount > 0 ? `${t.ungradedCount} ungraded` : "all graded"}
          />
          <StatTile
            label="Honors + AP"
            value={
              t.allCredits > 0
                ? `${Math.round(((t.mix.AP + t.mix.Honors) / t.allCredits) * 100)}%`
                : "—"
            }
            hint="of your credits"
          />
          <StatTile
            label="Rigor bonus"
            value={
              t.weighted && t.unweighted ? formatGpa(t.weighted.gpa - t.unweighted.gpa, 2) : "—"
            }
            hint="weighted − unweighted"
          />

          {/* ---- Credit mix ---------------------------------------------- */}
          <Card className="col-span-2 md:col-span-4 lg:col-span-2 xl:col-span-4">
            <CardHeader title="Credit mix" hint="Every credit on your schedule, by course level." />
            <div className="flex flex-wrap items-center gap-6 px-5 pb-5">
              <Donut
                size={116}
                thickness={16}
                centerLabel={trimZeros(t.allCredits.toFixed(2))}
                centerCaption="credits"
                slices={creditSlices(t.mix)}
              />
              <div className="min-w-[190px] flex-1">
                <DonutLegend slices={creditSlices(t.mix)} />
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ---- Subjects ------------------------------------------------------ */}
      {t.subjects.length > 0 ? (
        <Card>
          <CardHeader
            title="Subject strengths"
            hint="Weighted GPA per subject, credit-weighted across every graded class."
          />
          <div className="px-5 pb-5">
            <BarChart
              data={t.subjects.map((subject) => ({
                label: subject.subject,
                value: subject.gpa,
                display: formatGpa(subject.gpa, settings.precision),
                meta: `${trimZeros(subject.credits.toFixed(2))} cr`,
              }))}
              max={Math.max(4, ...t.subjects.map((s) => s.gpa))}
              precision={settings.precision}
            />
          </div>
        </Card>
      ) : null}

      {/* ---- Years --------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="By year"
          hint="Each grade level, each semester, and the classes inside them."
          action={
            <Button size="sm" variant="outline" onClick={() => onNavigate("classes")}>
              Manage classes
            </Button>
          }
        />
        <div className="border-t border-line">
          {t.years.map((year) => (
            <YearBlock key={year.gradeLevel} year={year} scale={scale} />
          ))}
          {t.years.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">
              No classes yet.{" "}
              <button className="font-semibold text-brand underline" onClick={onAddClass}>
                Add one
              </button>
              .
            </p>
          ) : null}
        </div>
      </Card>

      {t.simulate ? (
        <p className="text-center text-[12.5px] text-warn">
          Simulation is on — these numbers include hypothetical grades.{" "}
          <button
            className="font-semibold underline"
            onClick={() => {
              onNavigate("simulate");
              toast("Turn simulation off from the Simulate page.", { tone: "neutral" });
            }}
          >
            Review it
          </button>
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Readout card                                                                */
/* -------------------------------------------------------------------------- */

function ReadoutCard({
  eyebrow,
  reading,
  scale,
  onScaleChange,
  momentum,
  sparkline,
  primary = false,
  simulated = false,
  realValue,
}: {
  eyebrow: string;
  reading: Reading | null;
  scale: Scale;
  onScaleChange?: (scale: Scale) => void;
  momentum: number | null;
  sparkline: (number | null)[];
  primary?: boolean;
  simulated?: boolean;
  realValue?: Reading | null;
}) {
  const { settings } = useStore();

  const decimals = scale === "gpa" ? settings.precision : scale === "ten" ? 2 : 1;
  const numeric =
    reading === null ? null : scale === "gpa" ? reading.gpa : scale === "ten" ? reading.ten : reading.percent;

  return (
    <Card className={cx("flex flex-col p-5", primary && "ring-1 ring-brand/10")}>
      <div className="flex items-start gap-3">
        <span className="eyebrow">{eyebrow}</span>
        <div className="ml-auto flex items-center gap-2">
          {simulated ? (
            <Badge tone="warn" title={`Actually ${formatGpa(realValue?.gpa, settings.precision)}`}>
              projected
            </Badge>
          ) : null}
          {onScaleChange ? (
            <Segmented
              size="sm"
              value={scale}
              onChange={onScaleChange}
              ariaLabel="GPA scale"
              options={[
                { value: "gpa", label: "4.0", title: "The 4.0 scale" },
                { value: "percent", label: "100", title: "Average percentage" },
                { value: "ten", label: "10", title: "Average out of ten" },
              ]}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <span
          className={cx(
            "tnum leading-[0.9] font-semibold",
            primary ? "text-[clamp(46px,9vw,60px)]" : "text-[clamp(38px,7vw,48px)]",
            simulated ? "text-warn" : "text-brand",
          )}
        >
          <AnimatedNumber value={numeric} decimals={decimals} />
        </span>
        <span className="pb-1.5 text-[13px] font-semibold text-ink-3">{SCALE_SUFFIX[scale]}</span>

        <div className="ml-auto pb-1">
          <Sparkline values={sparkline} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line-strong pt-3">
        {momentum !== null ? (
          <Badge
            tone={Math.abs(momentum) < 0.005 ? "neutral" : momentum > 0 ? "brand" : "warn"}
            title="Change since the previous graded term"
          >
            {momentum > 0.005 ? (
              <IconArrowUp size={11} />
            ) : momentum < -0.005 ? (
              <IconArrowDown size={11} />
            ) : null}
            <span className="tnum">{formatDelta(momentum, settings.precision)}</span>
            <span className="font-medium">vs last term</span>
          </Badge>
        ) : null}

        <span className="text-[12.5px] text-ink-2">
          {reading ? (
            <>
              <b className="tnum font-semibold text-ink">
                {formatScaleValue(reading, "percent", settings)}%
              </b>{" "}
              average across{" "}
              <b className="tnum font-semibold text-ink">{trimZeros(reading.credits.toFixed(2))}</b>{" "}
              credits
            </>
          ) : (
            "No graded classes yet."
          )}
        </span>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Target card                                                                 */
/* -------------------------------------------------------------------------- */

function TargetCard({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const t = useTranscript();
  const { settings } = useStore();
  const target = t.targetWeighted;

  const tone: "brand" | "warn" = target.met ? "brand" : target.achievable ? "brand" : "warn";

  const headline = target.met
    ? "Target met"
    : target.outOfRoad
      ? "No credits left"
      : target.achievable
        ? `Average ${trimZeros((target.requiredPercent ?? 0).toFixed(1))}%`
        : "Out of reach";

  const body = target.met
    ? `You are at ${formatGpa(target.current, settings.precision)} weighted, past the ${formatGpa(target.target, settings.precision)} you set.${
        target.remainingCredits > 0
          ? ` Hold ${trimZeros((target.requiredPercent ?? 0).toFixed(1))}% or better across the ${trimZeros(target.remainingCredits.toFixed(2))} credits still open to stay there.`
          : ""
      }`
    : target.outOfRoad
      ? `Every credit is graded and the cumulative weighted GPA finished at ${formatGpa(target.current, settings.precision)}. Add next semester's classes to reopen the math.`
      : target.achievable
        ? `Across the ${trimZeros(target.remainingCredits.toFixed(2))} credits you have not been graded on — roughly ${percentToLetter(target.requiredPercent ?? 0)} work${
            target.remainingBump > 0
              ? `, already allowing for the ${trimZeros(target.remainingBump.toFixed(1))}-point bump those classes carry`
              : ""
          }.`
        : `Reaching ${formatGpa(target.target, settings.precision)} would take a ${trimZeros((target.requiredPercent ?? 0).toFixed(1))}% average across the credits left — more than a perfect score allows. Adjust the target or add coursework.`;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Target progress"
        hint={`Weighted, aiming for ${formatGpa(settings.targetWeighted, settings.precision)}`}
        action={
          <Button size="sm" variant="ghost" onClick={() => onNavigate("settings")}>
            <IconTarget size={14} />
            Change
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-center gap-6 px-5 pb-3 sm:justify-start">
        <Gauge
          value={target.progress}
          tone={tone}
          label={formatGpa(target.current, settings.precision)}
          caption={`of ${formatGpa(target.target, settings.precision)}`}
        />

        <div className="min-w-[200px] flex-1">
          <p
            className={cx(
              "text-[15px] leading-tight font-bold",
              tone === "warn" ? "text-warn" : "text-brand",
            )}
          >
            {headline}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{body}</p>

          <div className="mt-3.5">
            <Progress
              value={target.progress}
              tone={tone === "warn" ? "warn" : "brand"}
              label="Progress toward the target GPA"
            />
            <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-ink-3">
              <span>0.0</span>
              <span className="tnum">{Math.round(target.progress * 100)}%</span>
              <span className="tnum">{formatGpa(target.target, 2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-px border-t border-line bg-line">
        <MiniStat label="Earned" value={trimZeros(target.earnedCredits.toFixed(2))} suffix="cr" />
        <MiniStat label="Open" value={trimZeros(target.remainingCredits.toFixed(2))} suffix="cr" />
        <MiniStat
          label="Needed"
          value={
            target.requiredGpa === null ? "—" : formatGpa(target.requiredGpa, settings.precision)
          }
          suffix="gpa"
        />
      </div>
    </Card>
  );
}

function MiniStat({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="bg-surface px-4 py-3 text-center first:rounded-bl-[var(--radius-lg)] last:rounded-br-[var(--radius-lg)]">
      <div className="eyebrow">{label}</div>
      <div className="tnum mt-0.5 text-[17px] font-semibold text-ink">
        {value}
        <span className="ml-1 font-sans text-[10px] font-bold text-ink-3 uppercase">{suffix}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat tile                                                                   */
/* -------------------------------------------------------------------------- */

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="flex flex-col justify-center px-4 py-4">
      <div className="eyebrow">{label}</div>
      <div className="tnum mt-1 text-[26px] leading-none font-semibold text-ink">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-ink-3">{hint}</div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Year block                                                                  */
/* -------------------------------------------------------------------------- */

function YearBlock({
  year,
  scale,
}: {
  year: ReturnType<typeof useTranscript>["years"][number];
  scale: Scale;
}) {
  const { settings } = useStore();
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2"
      >
        <span
          className={cx(
            "grid h-5 w-5 shrink-0 place-items-center text-ink-3 transition-transform",
            open && "rotate-90",
          )}
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="m4 2 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>

        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-ink">
            {GRADE_NAMES[year.gradeLevel]} year
          </span>
          <span className="block text-[11.5px] text-ink-3">
            {year.academicYear} · {pluralize(year.courses.length, "class", "classes")}
          </span>
        </span>

        <span className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="text-right">
            <span className="tnum block text-[17px] leading-none font-semibold text-brand">
              {formatScaleValue(year.weighted, scale, settings)}
            </span>
            <span className="block text-[10px] font-bold tracking-[0.06em] text-ink-3 uppercase">
              weighted
            </span>
          </span>
          <span className="hidden text-right sm:block">
            <span className="tnum block text-[17px] leading-none font-semibold text-ink-2">
              {formatScaleValue(year.unweighted, scale, settings)}
            </span>
            <span className="block text-[10px] font-bold tracking-[0.06em] text-ink-3 uppercase">
              unweighted
            </span>
          </span>
        </span>
      </button>

      {open ? (
        <div className="bg-surface-2/60">
          {year.terms.map((term) => (
            <div key={term.key} className="border-t border-line">
              <div className="flex flex-wrap items-center gap-2 px-5 py-2">
                <h4 className="text-[12px] font-bold tracking-[0.04em] text-ink-2 uppercase">
                  {termName(term.term)}
                </h4>
                <Badge tone="outline">
                  <span className="tnum">{formatScaleValue(term.weighted, scale, settings)}</span>
                  <span className="font-medium">wtd</span>
                </Badge>
                <Badge tone="outline">
                  <span className="tnum">{trimZeros((term.weighted?.credits ?? 0).toFixed(2))}</span>
                  <span className="font-medium">cr</span>
                </Badge>
              </div>

              <ul className="px-2 pb-2">
                {term.courses.map((course) => (
                  <li
                    key={course.id}
                    className="flex items-center gap-2.5 rounded-[9px] px-3 py-1.5 text-[13px] hover:bg-surface"
                  >
                    <DifficultyBadge
                      difficulty={course.difficulty}
                      bump={settings.bumps[course.difficulty]}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">
                      {course.name}
                    </span>
                    <span className="tnum shrink-0 text-[11.5px] text-ink-3">
                      {trimZeros(course.credits.toFixed(2))} cr
                    </span>
                    <span
                      className={cx(
                        "tnum w-14 shrink-0 text-right font-semibold",
                        course.percent === null ? "text-ink-3" : "text-ink",
                      )}
                    >
                      {course.percent === null
                        ? course.projected !== null && settings.simulate
                          ? `${trimZeros(course.projected.toFixed(1))}*`
                          : "—"
                        : trimZeros(course.percent.toFixed(1))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function creditSlices(mix: Record<"Regular" | "Honors" | "AP", number>) {
  return [
    { label: "AP", value: mix.AP, color: "var(--lvl-ap)" },
    { label: "Honors", value: mix.Honors, color: "var(--lvl-honors)" },
    { label: "Regular", value: mix.Regular, color: "var(--lvl-regular)" },
  ];
}
