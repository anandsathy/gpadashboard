# GPA Dashboard

A weighted and unweighted GPA tracker for grades 9–12, in Westminster forest green and white.

Add the classes on your schedule, record grades as they land, and see what your GPA is doing —
by semester, by year, and cumulatively — plus what you need from here to hit a target, and what
happens if next semester goes a particular way.

Works signed out. Signs in with Google to sync across devices. Works offline.

---

## What it does

**Classes.** Add, edit, and delete courses with a name, subject, grade level, semester, credit
hours, difficulty (Regular / Honors / AP), and a grade as either a percentage or a letter. Grades
are editable in place, so correcting a past semester takes one click and one keystroke. Year-long
courses create one row per semester, linked so a rename updates both while each keeps its own grade.

**GPA.** Weighted and unweighted, on three scales — 4.0, /100, and /10 — broken out by semester, by
year, and cumulatively. The weighting rule follows the school's: course points are added to the
*percentage* before it is converted, so an AP 95 becomes a 102 and lands above 4.0 rather than being
quietly capped there.

**Dashboard.** Cumulative readouts with term-over-term movement, a trend chart with the target drawn
on it, progress toward the target, the credit mix, subject strengths, and every year broken down.

**Target.** Set a weighted and an unweighted goal. The app solves backwards for the average you need
across your remaining credits — and reports it as a raw percentage, having already subtracted the
difficulty bump the remaining courses carry, so it's the number that would actually appear on a
report card.

**Simulate.** Type or drag hypothetical grades and watch the projected GPA move. Projections live in
their own field and never overwrite a recorded grade: turning simulation off restores the real
transcript exactly, with nothing to undo.

**Insights.** The numbers, said out loud — momentum, strongest and weakest subjects, which class is
dragging hardest, what course rigor is actually worth to you, how far from the next milestone.

**Transcript.** A print-ready academic record. `Cmd-P` produces a document, not a screenshot of an
app.

**And.** Command palette (`⌘K`), keyboard shortcuts (`?`), full undo/redo, dark mode, CSV and JSON
import/export, offline support, and a phone layout that is not a squeezed desktop one.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then build to the repository root |
| `npm test` | Unit tests for the GPA engine |
| `npm run typecheck` | TypeScript, no emit |
| `npm run check` | Typecheck + tests |
| `npm run icons` | Regenerate the PNG app icons from `icon.svg` |

---

## How this gets published

GitHub Pages serves this repository's default branch from its **root**, so the production build is
emitted there — `index.html`, `assets/`, and the icons — and **committed**. That is deliberate, and
it is why running `npm run build` produces a diff:

- The source lives in `app/`. Vite's `root` is `app/`, and its `outDir` is the repository root.
- `assetsDir` is `assets/`, and filenames are content-hashed, so a clean rebuild of unchanged
  source reproduces byte-identical output. CI checks exactly this and fails if the committed
  build has drifted from source.
- `base` is `./`, so every asset URL is relative. The same build works at
  `username.github.io/gpadashboard/`, at a custom domain root, and from a `file://` copy.

**After changing anything in `app/`, run `npm run build` and commit the result** — otherwise the
published site keeps serving the previous version.

If you would rather Pages built from source itself, set **Settings → Pages → Source** to
*GitHub Actions*; `.github/workflows/deploy.yml` is already written and will take over.

---

## The weighting rule

The school adds points to the percentage grade *before* converting to the GPA scale. The defaults:

| Level | Added | A 95 becomes | On the 4.0 scale |
| --- | --- | --- | --- |
| Regular | +0 | 95 | 3.50 |
| Honors | +5 | 100 | 4.00 |
| AP | +7 | 102 | 4.20 |

Every one of those numbers is editable in **Settings**, along with two choices that matter more than
they look:

- **Percent → 4.0.** *Linear* (60% is a 0.0, 100% is a 4.0, ten points to the grade point) or
  *letter bands* (93–96 is an A, 90–92 an A−). Linear is the default because it is what a
  bump-the-percentage rule implies: the seven extra points on an AP course have to show up
  somewhere, and banding swallows them.
- **Averaging.** *Per course* converts each course to points and then credit-weights them — ordinary
  transcript arithmetic. *Aggregate* averages the percentages first and converts once, which is what
  some schools publish. They disagree, sometimes by a lot, so the setting exists.

> **Check one semester against your real transcript.** The app computes from the rule above and
> nothing else — it does not know your school's official policy. If the numbers disagree, the fix is
> almost always the weighting or the averaging method on the Settings page. Verify the exact values
> against the school's published policy; the defaults here are the documented ones but schools change
> them without announcing it.

---

## Your data

**Signed out**, everything lives in `localStorage` on that device and never leaves it.

**Signed in**, it syncs to Firestore at `students/{your-uid}`. The app is offline-first: local
storage is the primary store and Firestore is a sync layer on top, so a dead network, a blocked CDN,
or a Firebase project that was never configured degrades to local-only rather than to a blank screen.

The Firebase web API key in `app/src/firebase/config.ts` is a public project identifier, not a
secret — it ships in every Firebase web app. What actually protects a student's grades is
[`firestore.rules`](./firestore.rules) (a signed-in user can read and write exactly one document,
their own) plus the Authorized Domains list under Firebase Console → Authentication → Settings.

Point a fork at a different project with `VITE_FIREBASE_*` environment variables; no source change
needed.

### Coming from the previous version

The single-file build that used to live here stored classes under `fouryears:v1`. On first load
that data is found, migrated, and reported — including its settings. Two of those are carried
forward deliberately rather than replaced with the new defaults: the old build averaged percentages
before converting (`aggregate`) and stored a percentage target, so both are preserved. A rewrite
that silently changes what someone's GPA reads is a bug, however much more standard the new default
is.

---

## Layout

```
app/
├── index.html              Vite entry
├── public/                 Icons, manifest, service worker
└── src/
    ├── lib/                Pure domain logic — no React anywhere in here
    │   ├── types.ts        The whole domain in one file
    │   ├── scale.ts        Letter bands, percent ↔ 4.0 conversion, grade parsing
    │   ├── gpa.ts          Averaging, grouping, trend, the target solver
    │   ├── gpa.test.ts     46 tests over the above
    │   ├── insights.ts     Observations, derived from the same engine
    │   ├── csv.ts          CSV/JSON import and export
    │   └── defaults.ts     Defaults, course catalog, sample transcript
    ├── store/              Reducer, undo/redo, persistence, Firestore sync, migration
    ├── firebase/           Lazily-loaded SDK wrapper
    ├── components/
    │   ├── ui/             Design-system primitives
    │   ├── charts/         Hand-rolled SVG charts — no charting library
    │   └── layout/         App shell
    ├── pages/              Dashboard, Classes, Simulate, Insights, Transcript, Settings
    └── hooks/
```

The engine in `src/lib/` is pure: courses and settings in, numbers out. No React, no storage, no
clock. That is what makes it testable, and `gpa.test.ts` leans on it hard — including the case that
a projected grade never leaks into a real total, and that a bumped grade is never capped at 4.0.

The charts are hand-written SVG rather than a charting library. Roughly the same amount of code as
configuring one, a fraction of the bundle, and every line and fill reads from the same green tokens
as the rest of the app instead of being fought with theme overrides. The trend line uses monotone
cubic interpolation, which cannot overshoot — a smoothed curve must never draw a dip through a term
the student never had.

---

## Colors

| Token | Light | Role |
| --- | --- | --- |
| `--wm-forest` | `#014421` | Headings, links, primary chart line, AP badge |
| `--wm-accent` | `#1B7A3D` | Hover, highlights, secondary line, Honors badge |
| `--bg` / `--surface` | `#F7F8F6` / `#FFFFFF` | Page and cards |
| `--ink` | `#1A1A1A` | Body copy |
| `--warn` | `#9A6C12` | Muted gold — at risk of missing target |
| `--danger` | `#B0453A` | Soft red — destructive actions only |

Every color in the app is a token in `app/src/index.css`; nothing hardcodes a hex outside that file,
and the dark theme re-points the same tokens so no component knows which theme is active.

> The forest green above is a close approximation. If a pixel-perfect brand match matters, check it
> against Westminster's official style guide and change the two values at the top of `index.css` —
> everything else follows.

---

## Not in this version

No parent or multi-student accounts, no class rank or comparison to other students, and no native
mobile app — the web app is responsive and installable as a PWA instead.
