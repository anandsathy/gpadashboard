import { useStore } from "@/store/StoreProvider";
import { useTranscript } from "@/hooks/useTranscript";
import { coursesToCsv, downloadFile, timestampedName } from "@/lib/csv";
import { formatGpa, trimZeros } from "@/lib/format";
import { GRADE_NAMES, academicYear, termName } from "@/lib/gpa";
import { percentToLetter } from "@/lib/scale";
import { IconDownload, IconPrint, IconTranscript } from "@/components/ui/Icons";
import { Button, Card, EmptyState, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/**
 * The printable transcript.
 *
 * This page exists to survive Cmd-P: the print stylesheet strips the chrome,
 * flattens the shadows, and forces black text on white, so what comes out of
 * the printer is a document rather than a screenshot of an app.
 */

export function Transcript({ onAddClass }: { onAddClass: () => void }) {
  const { data, settings, profile } = useStore();
  const { toast } = useToast();
  const t = useTranscript();

  if (t.isEmpty) {
    return (
      <Card className="anim-rise mt-6">
        <EmptyState
          icon={<IconTranscript size={22} />}
          title="Nothing to print yet"
          body="Add your classes and this becomes a clean, printable record of every semester — grades, credits, course level, and the averages underneath."
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
    <div className="flex flex-col gap-4">
      {/* ---- Actions ------------------------------------------------------- */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[13px] text-ink-2">
          A print-ready record of every semester. Use your browser's “Save as PDF” to keep a copy.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            downloadFile(
              timestampedName("gpa-transcript", "csv"),
              coursesToCsv(t.courses),
              "text/csv",
            );
            toast("Downloaded a CSV of every class.", { tone: "good" });
          }}
        >
          <IconDownload size={15} />
          CSV
        </Button>
        <Button variant="solid" onClick={() => window.print()}>
          <IconPrint size={15} />
          Print
        </Button>
      </div>

      <Card className="print-page px-5 py-6 sm:px-8 sm:py-8">
        {/* ---- Letterhead -------------------------------------------------- */}
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[var(--brand)] pb-4">
          <div>
            <h1 className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-brand">
              Academic Record
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">
              {profile.name ? `${profile.name} · ` : ""}Class of {settings.graduationYear}
            </p>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-bold tracking-[0.12em] text-ink-3 uppercase">
              Cumulative
            </div>
            <div className="tnum text-[26px] leading-none font-semibold text-brand">
              {formatGpa(t.weighted?.gpa, settings.precision)}
            </div>
            <div className="mt-1 text-[11.5px] text-ink-2">
              weighted · {formatGpa(t.unweighted?.gpa, settings.precision)} unweighted
            </div>
          </div>
        </header>

        {t.simulate ? (
          <p className="mt-3 rounded-[8px] border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] font-semibold text-warn">
            Simulation mode is on — these figures include hypothetical grades and are not a record
            of work completed.
          </p>
        ) : null}

        {/* ---- Years ------------------------------------------------------- */}
        {t.years.map((year) => (
          <section key={year.gradeLevel} className="print-page mt-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1.5">
              <h2 className="text-[15px] font-bold text-ink">
                {GRADE_NAMES[year.gradeLevel]} year
                <span className="ml-2 text-[12px] font-medium text-ink-3">
                  {academicYear(year.gradeLevel, settings.graduationYear)}
                </span>
              </h2>
              <div className="tnum text-[12.5px] font-semibold text-ink-2">
                {formatGpa(year.weighted?.gpa, settings.precision)} wtd ·{" "}
                {formatGpa(year.unweighted?.gpa, settings.precision)} unwtd ·{" "}
                {trimZeros((year.weighted?.credits ?? 0).toFixed(2))} cr
              </div>
            </div>

            {year.terms.map((term) => (
              <div key={term.key} className="mt-4">
                <h3 className="mb-1.5 text-[11px] font-bold tracking-[0.1em] text-ink-3 uppercase">
                  {termName(term.term)} semester
                </h3>

                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="py-1.5 pr-3 text-[10px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                        Course
                      </th>
                      <th className="py-1.5 pr-3 text-[10px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                        Level
                      </th>
                      <th className="py-1.5 pr-3 text-right text-[10px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                        Credits
                      </th>
                      <th className="py-1.5 pr-3 text-right text-[10px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                        Grade
                      </th>
                      <th className="py-1.5 text-right text-[10px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                        Weighted
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {term.courses.map((course) => {
                      const bump = settings.bumps[course.difficulty] ?? 0;
                      return (
                        <tr key={course.id} className="border-b border-line/60 last:border-b-0">
                          <td className="py-1.5 pr-3 font-medium text-ink">{course.name}</td>
                          <td className="py-1.5 pr-3 text-ink-2">{course.difficulty}</td>
                          <td className="tnum py-1.5 pr-3 text-right text-ink-2">
                            {trimZeros(course.credits.toFixed(2))}
                          </td>
                          <td className="tnum py-1.5 pr-3 text-right text-ink">
                            {course.percent === null ? (
                              <span className="text-ink-3">in progress</span>
                            ) : (
                              <>
                                {trimZeros(course.percent.toFixed(1))}
                                <span className="ml-1.5 font-sans text-[11px] text-ink-3">
                                  {percentToLetter(course.percent)}
                                </span>
                              </>
                            )}
                          </td>
                          <td
                            className={cx(
                              "tnum py-1.5 text-right font-semibold",
                              course.percent === null ? "text-ink-3" : "text-brand",
                            )}
                          >
                            {course.percent === null
                              ? "—"
                              : trimZeros((course.percent + bump).toFixed(1))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line">
                      <td colSpan={2} className="py-1.5 text-[11.5px] font-bold text-ink-2 uppercase">
                        Semester average
                      </td>
                      <td className="tnum py-1.5 pr-3 text-right text-[12.5px] font-semibold text-ink-2">
                        {trimZeros((term.weighted?.credits ?? 0).toFixed(2))}
                      </td>
                      <td className="tnum py-1.5 pr-3 text-right text-[12.5px] font-semibold text-ink-2">
                        {term.unweighted ? formatGpa(term.unweighted.gpa, settings.precision) : "—"}
                      </td>
                      <td className="tnum py-1.5 text-right text-[12.5px] font-bold text-brand">
                        {term.weighted ? formatGpa(term.weighted.gpa, settings.precision) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </section>
        ))}

        {/* ---- Summary ----------------------------------------------------- */}
        <section className="print-page mt-8 border-t-2 border-[var(--brand)] pt-4">
          <h2 className="text-[13px] font-bold tracking-[0.06em] text-ink uppercase">Summary</h2>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-4">
            <SummaryItem
              label="Weighted GPA"
              value={formatGpa(t.weighted?.gpa, settings.precision)}
              strong
            />
            <SummaryItem
              label="Unweighted GPA"
              value={formatGpa(t.unweighted?.gpa, settings.precision)}
            />
            <SummaryItem label="Credits graded" value={trimZeros(t.earnedCredits.toFixed(2))} />
            <SummaryItem label="Credits in progress" value={trimZeros(t.openCredits.toFixed(2))} />
            <SummaryItem
              label="Average percentage"
              value={t.weighted ? `${trimZeros(t.weighted.percent.toFixed(1))}%` : "—"}
            />
            <SummaryItem label="AP credits" value={trimZeros(t.mix.AP.toFixed(2))} />
            <SummaryItem label="Honors credits" value={trimZeros(t.mix.Honors.toFixed(2))} />
            <SummaryItem label="Regular credits" value={trimZeros(t.mix.Regular.toFixed(2))} />
          </dl>

          <p className="mt-5 border-t border-line pt-3 text-[10.5px] leading-relaxed text-ink-3">
            Weighting: {difficultyNote(settings.bumps)}. Percentages are
            converted to the 4.0 scale{" "}
            {settings.conversion === "linear"
              ? "linearly, with 60% as a 0.0 and 100% as a 4.0"
              : "by letter band"}
            , and averages are {settings.averaging === "per-course" ? "taken per course and then credit-weighted" : "taken across percentages and converted once"}.
            Generated by GPA Dashboard on {new Date().toLocaleDateString()}. This is a personal
            record, not an official transcript.
          </p>
        </section>
      </Card>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold tracking-[0.08em] text-ink-3 uppercase">{label}</dt>
      <dd
        className={cx(
          "tnum mt-0.5 font-semibold",
          strong ? "text-[19px] text-brand" : "text-[16px] text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function difficultyNote(bumps: Record<string, number>): string {
  return (["Regular", "Honors", "AP"] as const)
    .map((level) => `${level} ${bumps[level]! >= 0 ? "+" : ""}${bumps[level]}`)
    .join(", ");
}
