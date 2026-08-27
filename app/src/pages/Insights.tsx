import { useMemo } from "react";

import { useStore } from "@/store/StoreProvider";
import { useTranscript } from "@/hooks/useTranscript";
import { DIPLOMA_CREDITS, buildInsights, type Insight, type InsightTone } from "@/lib/insights";
import { formatGpa, pluralize, trimZeros } from "@/lib/format";
import { courseImpact, effectiveGrade, termLabel } from "@/lib/gpa";
import { percentToLetter } from "@/lib/scale";
import { BarChart } from "@/components/charts/MiniCharts";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconInfo,
  IconInsights,
  IconWarning,
} from "@/components/ui/Icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DifficultyBadge,
  EmptyState,
  Progress,
  cx,
} from "@/components/ui/primitives";

/**
 * Insights: the numbers, said out loud.
 *
 * Everything on this page is derived from the same engine the dashboard uses —
 * there is no second source of truth, and no observation that the transcript
 * cannot support.
 */

const TONE_STYLES: Record<InsightTone, { card: string; icon: string; Icon: typeof IconCheck }> = {
  good: {
    card: "border-brand/25 bg-brand-soft/40",
    icon: "bg-brand-soft text-brand",
    Icon: IconCheck,
  },
  warn: {
    card: "border-warn/30 bg-warn-soft/40",
    icon: "bg-warn-soft text-warn",
    Icon: IconWarning,
  },
  info: {
    card: "border-line bg-surface",
    icon: "bg-info-soft text-info",
    Icon: IconInfo,
  },
  neutral: {
    card: "border-line bg-surface",
    icon: "bg-surface-2 text-ink-3",
    Icon: IconInfo,
  },
};

export function Insights({ onAddClass }: { onAddClass: () => void }) {
  const { data, settings } = useStore();
  const t = useTranscript();

  const insights = useMemo(
    () => buildInsights(data.courses, settings, settings.simulate),
    [data.courses, settings],
  );

  const impacts = useMemo(() => {
    const graded = data.courses.filter((c) => effectiveGrade(c, settings.simulate) !== null);
    if (graded.length < 2) return [];
    return graded
      .map((course) => ({
        course,
        impact: courseImpact(data.courses, course, settings, settings.simulate),
      }))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 8);
  }, [data.courses, settings]);

  const termComparison = useMemo(
    () =>
      t.trend
        .filter((point) => point.weighted !== null)
        .map((point) => ({
          label: point.shortLabel,
          value: point.weighted as number,
          display: formatGpa(point.weighted, settings.precision),
          meta: `${trimZeros(point.credits.toFixed(2))} cr`,
        })),
    [t.trend, settings.precision],
  );

  if (!t.hasAnyGrades) {
    return (
      <Card className="anim-rise mt-6">
        <EmptyState
          icon={<IconInsights size={22} />}
          title="No grades to read yet"
          body="Once a class has a grade, this page starts reporting trends, subject strengths, which class is pulling hardest, and exactly what you need from here."
          action={
            <Button variant="solid" size="lg" onClick={onAddClass}>
              Add a graded class
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="stagger flex flex-col gap-4 sm:gap-5">
      {/* ---- Cards --------------------------------------------------------- */}
      <div className="grid gap-4 md:grid-cols-2">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>

      {/* ---- Impact -------------------------------------------------------- */}
      {impacts.length > 0 ? (
        <Card>
          <CardHeader
            title="What each class is doing to your average"
            hint="How much the cumulative weighted GPA would move if the class came off your transcript entirely."
          />
          <ul className="border-t border-line">
            {impacts.map(({ course, impact }) => {
              const grade = effectiveGrade(course, settings.simulate);
              const magnitude = Math.min(1, Math.abs(impact) / 0.25);
              return (
                <li
                  key={course.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-5 py-3 last:border-b-0"
                >
                  <DifficultyBadge
                    difficulty={course.difficulty}
                    bump={settings.bumps[course.difficulty]}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-ink">
                      {course.name}
                    </div>
                    <div className="text-[11.5px] text-ink-3">
                      {termLabel(course.gradeLevel, course.term)} ·{" "}
                      {grade === null ? "—" : `${trimZeros(grade.toFixed(1))} (${percentToLetter(grade)})`}
                    </div>
                  </div>

                  {/* A centred bar: right of the line lifts, left of it drags. */}
                  <div className="relative hidden h-2 w-40 overflow-hidden rounded-full bg-surface-3 sm:block">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                    <span
                      className="absolute inset-y-0 rounded-full transition-[width,left] duration-500"
                      style={{
                        width: `${magnitude * 50}%`,
                        left: impact >= 0 ? "50%" : `${50 - magnitude * 50}%`,
                        background: impact >= 0 ? "var(--brand-2)" : "var(--warn)",
                      }}
                    />
                  </div>

                  <Badge tone={impact >= 0 ? "brand" : "warn"} className="w-[5.5rem] justify-center">
                    {impact >= 0 ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
                    <span className="tnum">
                      {Math.abs(impact) < 0.005 ? "0.00" : Math.abs(impact).toFixed(settings.precision)}
                    </span>
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* ---- Terms + credits ----------------------------------------------- */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Term by term"
            hint="Each semester on its own, not cumulative — the volatile view."
          />
          <div className="px-5 pb-5">
            <BarChart
              data={termComparison}
              max={Math.max(4, ...termComparison.map((d) => d.value))}
              precision={settings.precision}
              emptyLabel="One graded term so far."
            />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Credits"
            hint={`Against a ${DIPLOMA_CREDITS}-credit diploma — adjust for your school's actual requirement.`}
          />
          <div className="flex flex-1 flex-col justify-center px-5 pb-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="tnum text-[32px] leading-none font-semibold text-brand">
                  {trimZeros(t.earnedCredits.toFixed(2))}
                </div>
                <div className="mt-1 text-[11.5px] text-ink-3">credits graded</div>
              </div>
              <div className="text-right">
                <div className="tnum text-[19px] leading-none font-semibold text-ink-2">
                  {trimZeros(t.allCredits.toFixed(2))}
                </div>
                <div className="mt-1 text-[11.5px] text-ink-3">on your schedule</div>
              </div>
            </div>

            <Progress
              value={t.earnedCredits / DIPLOMA_CREDITS}
              className="mt-4"
              height={10}
              label="Credits toward a diploma"
            />

            <div className="mt-2 flex justify-between text-[11px] font-semibold text-ink-3">
              <span>0</span>
              <span className="tnum">
                {Math.round((t.earnedCredits / DIPLOMA_CREDITS) * 100)}%
              </span>
              <span className="tnum">{DIPLOMA_CREDITS}</span>
            </div>

            <p className="mt-4 border-t border-dashed border-line-strong pt-3 text-[12.5px] leading-relaxed text-ink-2">
              {pluralize(t.gradedCount, "class", "classes")} graded,{" "}
              {pluralize(t.ungradedCount, "class", "classes")} still open —{" "}
              <b className="tnum font-semibold text-ink">{trimZeros(t.openCredits.toFixed(2))}</b>{" "}
              credits that have yet to touch your GPA.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const style = TONE_STYLES[insight.tone];
  const { Icon } = style;

  return (
    <Card className={cx("flex gap-3.5 p-4", style.card)}>
      <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", style.icon)}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <h3 className="text-[14px] leading-tight font-bold text-ink">{insight.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{insight.body}</p>
      </div>
    </Card>
  );
}
