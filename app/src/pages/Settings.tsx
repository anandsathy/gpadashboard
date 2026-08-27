import { useRef, useState } from "react";

import { eraseLocalData, useStore } from "@/store/StoreProvider";
import { hydrate } from "@/store/migrate";
import { useTranscript } from "@/hooks/useTranscript";
import { DEFAULT_BUMPS, sampleCourses } from "@/lib/defaults";
import {
  coursesToCsv,
  csvToCourses,
  downloadFile,
  timestampedName,
} from "@/lib/csv";
import { formatBump, formatGpa, pluralize, trimZeros } from "@/lib/format";
import { percentToGpa } from "@/lib/scale";
import { DIFFICULTIES, type Averaging, type Conversion, type ThemeChoice } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/Modal";
import {
  IconDownload,
  IconGoogle,
  IconMoon,
  IconSparkle,
  IconSun,
  IconTarget,
  IconTrash,
  IconUpload,
} from "@/components/ui/Icons";
import { Avatar } from "@/components/layout/AppShell";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Segmented,
  Select,
  Switch,
  cx,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/**
 * Settings.
 *
 * The weighting rule lives here rather than in the code, because the exact
 * numbers are a school policy that changes without warning, and a student
 * whose transcript disagrees with the app needs to be able to fix it in
 * fifteen seconds rather than file a bug.
 */

export function Settings() {
  const { data, settings, dispatch, profile, signedIn, signIn, signOut, replaceAll, sync, syncMessage } =
    useStore();
  const { toast } = useToast();
  const t = useTranscript();

  const [confirmErase, setConfirmErase] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = (next: Parameters<typeof dispatch>[0] extends never ? never : Partial<typeof settings>) =>
    dispatch({ type: "update-settings", patch: next });

  /* ---- Import ---------------------------------------------------------- */

  const onFile = async (file: File) => {
    const text = await file.text();

    if (file.name.toLowerCase().endsWith(".json")) {
      try {
        const parsed = hydrate(JSON.parse(text));
        if (parsed.courses.length === 0) {
          toast("That JSON file had no classes in it.", { tone: "warn" });
          return;
        }
        replaceAll(
          { ...parsed, updatedAt: Date.now() },
          `Imported ${pluralize(parsed.courses.length, "class", "classes")} from backup.`,
        );
      } catch {
        toast("That file isn't valid JSON.", { tone: "danger" });
      }
      return;
    }

    const { courses, skipped } = csvToCourses(text);
    if (courses.length === 0) {
      toast(skipped[0]?.reason ?? "Nothing importable in that file.", { tone: "warn", duration: 6000 });
      return;
    }

    dispatch({
      type: "add-courses",
      courses,
      label: `import ${pluralize(courses.length, "class", "classes")}`,
    });
    toast(
      skipped.length > 0
        ? `Imported ${pluralize(courses.length, "class", "classes")}; skipped ${skipped.length}.`
        : `Imported ${pluralize(courses.length, "class", "classes")}.`,
      { tone: "good" },
    );
  };

  return (
    <div className="stagger mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-5">
      {/* ---- Account ------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Account"
          hint="Signing in with Google syncs your classes across every device you use."
        />
        <div className="flex flex-wrap items-center gap-4 px-5 pb-5">
          {signedIn ? (
            <>
              <Avatar size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink">
                  {profile.name ?? "Signed in"}
                </div>
                <div className="truncate text-[12.5px] text-ink-2">{profile.email}</div>
                <div className="mt-1 text-[11.5px] text-ink-3">{syncMessage}</div>
              </div>
              <Button variant="outline" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-relaxed text-ink-2">
                  You're working locally. Everything is saved in this browser and nothing leaves the
                  device — but clearing site data would take it with you.
                </p>
                <Badge tone="outline" className="mt-2">
                  {sync === "offline" ? "Storage blocked" : "This device only"}
                </Badge>
              </div>
              <Button variant="solid" onClick={signIn}>
                <IconGoogle size={15} />
                Sign in with Google
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* ---- Targets ------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Target GPA"
          hint="What you're aiming for. The dashboard solves backwards from these."
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field
            label="Weighted target"
            htmlFor="target-w"
            hint={
              t.targetWeighted.met
                ? "Already there."
                : t.targetWeighted.requiredPercent !== null
                  ? `Needs a ${trimZeros(t.targetWeighted.requiredPercent.toFixed(1))}% average from here.`
                  : "No ungraded credits left to work with."
            }
          >
            <Input
              id="target-w"
              type="number"
              step="0.05"
              min="0"
              max="6"
              value={settings.targetWeighted}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) patch({ targetWeighted: value });
              }}
            />
          </Field>

          <Field
            label="Unweighted target"
            htmlFor="target-u"
            hint={
              t.targetUnweighted.met
                ? "Already there."
                : `Currently ${formatGpa(t.targetUnweighted.current, settings.precision)}.`
            }
          >
            <Input
              id="target-u"
              type="number"
              step="0.05"
              min="0"
              max="4"
              value={settings.targetUnweighted}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) patch({ targetUnweighted: value });
              }}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
          <span className="mr-1 self-center text-[12px] font-semibold text-ink-3">Quick set:</span>
          {[3.5, 3.8, 4.0, 4.2, 4.5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => patch({ targetWeighted: value })}
              className={cx(
                "tnum rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                Math.abs(settings.targetWeighted - value) < 0.001
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line-strong text-ink-2 hover:border-brand hover:text-brand",
              )}
            >
              {value.toFixed(1)}
            </button>
          ))}
        </div>
      </Card>

      {/* ---- Weighting ----------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Weighting rule"
          hint="Your school adds points to the percentage grade before converting it to the 4.0 scale. Set the exact values here."
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                patch({ bumps: { ...DEFAULT_BUMPS } });
                toast("Reset to Regular +0, Honors +5, AP +7.", { tone: "neutral" });
              }}
            >
              Reset
            </Button>
          }
        />

        <div className="grid gap-4 px-5 pb-4 sm:grid-cols-3">
          {DIFFICULTIES.map((level) => (
            <Field
              key={level}
              label={level}
              htmlFor={`bump-${level}`}
              hint={`A 92 becomes ${trimZeros((92 + (settings.bumps[level] ?? 0)).toFixed(1))}`}
            >
              <Input
                id={`bump-${level}`}
                type="number"
                step="0.5"
                min="-20"
                max="20"
                value={settings.bumps[level]}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    patch({ bumps: { ...settings.bumps, [level]: value } });
                  }
                }}
              />
            </Field>
          ))}
        </div>

        <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-2">
          <Field
            label="Percent → 4.0 scale"
            hint={
              settings.conversion === "linear"
                ? "60% is a 0.0, 100% is a 4.0, ten points to the grade point. A bumped grade climbs past 4.0."
                : "Standard letter bands (93–96 is an A, 90–92 an A−). A bumped grade above 100 still climbs past 4.0."
            }
          >
            <Segmented
              value={settings.conversion}
              onChange={(value: Conversion) => patch({ conversion: value })}
              ariaLabel="Conversion method"
              options={[
                { value: "linear", label: "Linear" },
                { value: "bands", label: "Letter bands" },
              ]}
            />
          </Field>

          <Field
            label="Averaging"
            hint={
              settings.averaging === "per-course"
                ? "Each course converts to points, then the points are credit-weighted. The ordinary transcript method."
                : "Percentages are credit-averaged first and converted once. Matches schools that publish a single course-point average."
            }
          >
            <Segmented
              value={settings.averaging}
              onChange={(value: Averaging) => patch({ averaging: value })}
              ariaLabel="Averaging method"
              options={[
                { value: "per-course", label: "Per course" },
                { value: "aggregate", label: "Aggregate" },
              ]}
            />
          </Field>
        </div>

        {/* A live worked example, so the settings above are never abstract. */}
        <div className="border-t border-line bg-surface-2 px-5 py-3.5">
          <div className="eyebrow mb-2">Worked example — a 95 in each track</div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {DIFFICULTIES.map((level) => {
              const bumped = 95 + (settings.bumps[level] ?? 0);
              return (
                <div key={level} className="text-[12.5px]">
                  <span className="font-semibold text-ink-2">{level}</span>
                  <span className="text-ink-3">
                    {" "}
                    95 {formatBump(settings.bumps[level] ?? 0)} ={" "}
                  </span>
                  <span className="tnum font-semibold text-ink">
                    {trimZeros(bumped.toFixed(1))}
                  </span>
                  <span className="text-ink-3"> → </span>
                  <span className="tnum font-bold text-brand">
                    {formatGpa(percentToGpa(bumped, settings.conversion), settings.precision)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ---- Display ------------------------------------------------------- */}
      <Card>
        <CardHeader title="Display" />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Field label="Theme">
            <Segmented
              value={settings.theme}
              onChange={(value: ThemeChoice) => patch({ theme: value })}
              ariaLabel="Theme"
              options={[
                { value: "light", label: <><IconSun size={13} className="mr-1 inline" />Light</> },
                { value: "dark", label: <><IconMoon size={13} className="mr-1 inline" />Dark</> },
                { value: "system", label: "System" },
              ]}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GPA decimals" hint="How precisely every GPA is shown.">
              <Segmented
                value={String(settings.precision)}
                onChange={(value) => patch({ precision: value === "3" ? 3 : 2 })}
                ariaLabel="Decimal places"
                options={[
                  { value: "2", label: "2 — 3.85" },
                  { value: "3", label: "3 — 3.847" },
                ]}
              />
            </Field>

            <Field
              label="Graduation year"
              htmlFor="grad-year"
              hint="Used to label academic years on the transcript."
            >
              <Select
                id="grad-year"
                value={settings.graduationYear}
                onChange={(event) => patch({ graduationYear: Number(event.target.value) })}
              >
                {gradYearOptions().map((year) => (
                  <option key={year} value={year}>
                    Class of {year}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="border-t border-line pt-4">
            <Switch
              checked={settings.simulate}
              onChange={(next) => patch({ simulate: next })}
              label="Simulation mode"
              hint="Include hypothetical grades in every total across the app."
            />
          </div>
        </div>
      </Card>

      {/* ---- Data ---------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Your data"
          hint={`${pluralize(data.courses.length, "class", "classes")} · ${trimZeros(t.allCredits.toFixed(2))} credits`}
        />

        <div className="flex flex-wrap gap-2 px-5 pb-4">
          <Button
            variant="outline"
            onClick={() => {
              downloadFile(
                timestampedName("gpa-classes", "csv"),
                coursesToCsv(data.courses),
                "text/csv",
              );
              toast("Downloaded a CSV of every class.", { tone: "good" });
            }}
            disabled={data.courses.length === 0}
          >
            <IconDownload size={15} />
            Export CSV
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              downloadFile(
                timestampedName("gpa-backup", "json"),
                JSON.stringify(data, null, 2),
                "application/json",
              );
              toast("Downloaded a full backup.", { tone: "good" });
            }}
            disabled={data.courses.length === 0}
          >
            <IconDownload size={15} />
            Backup JSON
          </Button>

          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <IconUpload size={15} />
            Import
          </Button>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
              // Reset so re-picking the same file fires the handler again.
              event.target.value = "";
            }}
          />

          {data.courses.length === 0 ? (
            <Button
              variant="ghost"
              onClick={() =>
                replaceAll(
                  { ...data, courses: sampleCourses(), updatedAt: Date.now() },
                  "Loaded a sample transcript.",
                )
              }
            >
              <IconSparkle size={15} />
              Load sample data
            </Button>
          ) : null}
        </div>

        <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-3">
          A CSV import needs a column that looks like a class name; everything else — subject,
          grade level, semester, credits, difficulty, grade — is matched by common header names and
          defaulted when it's missing. Importing adds to your transcript; a JSON backup replaces it.
        </p>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-danger">Erase all coursework</div>
            <p className="text-[12.5px] leading-snug text-ink-2">
              Removes every class from this device{signedIn ? " and from your account" : ""}. Your
              settings stay. This one is undoable — but only until you reload.
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => setConfirmErase(true)}
            disabled={data.courses.length === 0}
          >
            <IconTrash size={15} />
            Erase
          </Button>
        </div>
      </Card>

      {/* ---- About --------------------------------------------------------- */}
      <Card className="px-5 py-4">
        <div className="flex items-start gap-3">
          <IconTarget size={17} className="mt-0.5 shrink-0 text-brand" />
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            GPA Dashboard computes from the rule set above and nothing else — it does not know your
            school's official policy. Check a semester against your real transcript once; if they
            disagree, the fix is almost always the weighting or the averaging method on this page.
          </p>
        </div>
      </Card>

      <ConfirmModal
        open={confirmErase}
        onClose={() => setConfirmErase(false)}
        onConfirm={() => {
          dispatch({ type: "reset" });
          eraseLocalData();
          toast("Erased every class. Undo is still available.", { tone: "neutral", duration: 7000 });
        }}
        title="Erase all coursework?"
        confirmLabel="Erase everything"
        body={`All ${pluralize(data.courses.length, "class", "classes")} come off your transcript. Your target GPA, weighting rule, and theme stay as they are.`}
      />
    </div>
  );
}

/** A window of graduation years around now — four back, six forward. */
function gradYearOptions(): number[] {
  const now = new Date();
  const base = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const years: number[] = [];
  for (let year = base - 4; year <= base + 6; year++) years.push(year);
  return years;
}
