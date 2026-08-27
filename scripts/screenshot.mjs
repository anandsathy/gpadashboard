/**
 * Drives the built app in a real browser and captures each page.
 *
 * This is a smoke test as much as a screenshot tool: it fails loudly on any
 * console error or page exception, so a runtime crash that a typecheck cannot
 * see gets caught before the build is called done.
 *
 *   node scripts/screenshot.mjs [outputDir]
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const outDir = process.argv[2] ?? `${root}.screenshots`;
const port = Number(process.env.PORT ?? 4178);

await mkdir(outDir, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const problems = [];

/** Seeds a transcript so the pages have something real to render. */
const SEED = {
  version: 3,
  settings: {
    targetWeighted: 4.2,
    targetUnweighted: 3.8,
    bumps: { Regular: 0, Honors: 5, AP: 7 },
    conversion: "linear",
    averaging: "per-course",
    graduationYear: 2028,
    simulate: false,
    theme: "light",
    precision: 2,
  },
  courses: [
    ["English 9", "English", "Regular", 9, "S1", 92],
    ["Algebra I", "Mathematics", "Regular", 9, "S1", 88],
    ["Biology", "Science", "Honors", 9, "S1", 90],
    ["World History", "History", "Regular", 9, "S1", 94],
    ["English 9", "English", "Regular", 9, "S2", 94],
    ["Algebra I", "Mathematics", "Regular", 9, "S2", 91],
    ["Biology", "Science", "Honors", 9, "S2", 93],
    ["World History", "History", "Regular", 9, "S2", 92],
    ["English 10", "English", "Honors", 10, "S1", 91],
    ["Geometry", "Mathematics", "Honors", 10, "S1", 87],
    ["AP World History", "History", "AP", 10, "S1", 93],
    ["Spanish III", "World Language", "Honors", 10, "S1", 92],
    ["English 10", "English", "Honors", 10, "S2", 93],
    ["Geometry", "Mathematics", "Honors", 10, "S2", 90],
    ["AP World History", "History", "AP", 10, "S2", 96],
    ["Spanish III", "World Language", "Honors", 10, "S2", 94],
    ["AP English Language", "English", "AP", 11, "S1", null],
    ["Precalculus", "Mathematics", "Honors", 11, "S1", null],
    ["AP Chemistry", "Science", "AP", 11, "S1", null],
    ["AP Computer Science A", "Computer Science", "AP", 11, "S1", null],
  ].map(([name, subject, difficulty, gradeLevel, term, percent], i) => ({
    id: `seed-${i}`,
    name,
    subject,
    difficulty,
    gradeLevel,
    term,
    credits: 0.5,
    percent,
    projected: null,
    pairId: null,
    note: "",
    createdAt: 0,
    updatedAt: 0,
  })),
  updatedAt: Date.now(),
};

// Serve the built root the way GitHub Pages would.
const server = await startServer(root, port);

try {
  const shots = [
    { route: "", name: "01-dashboard", theme: "light" },
    { route: "#/classes", name: "02-classes", theme: "light" },
    { route: "#/simulate", name: "03-simulate", theme: "light" },
    { route: "#/insights", name: "04-insights", theme: "light" },
    { route: "#/transcript", name: "05-transcript", theme: "light" },
    { route: "#/settings", name: "06-settings", theme: "light" },
    { route: "", name: "07-dashboard-dark", theme: "dark" },
    { route: "#/classes", name: "08-mobile", theme: "light", viewport: { width: 414, height: 900 } },
  ];

  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport ?? { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: shot.theme === "dark" ? "dark" : "light",
    });

    await context.addInitScript(
      ([data, theme]) => {
        localStorage.setItem("gpa-dashboard:v3", JSON.stringify(data));
        localStorage.setItem("gpa-dashboard:theme", theme);
      },
      [{ ...SEED, settings: { ...SEED.settings, theme: shot.theme } }, shot.theme],
    );

    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`[${shot.name}] console: ${msg.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`[${shot.name}] pageerror: ${error.message}`));

    await page.goto(`http://127.0.0.1:${port}/${shot.route}`, { waitUntil: "networkidle" });
    // Let the entry animations and the chart draw settle.
    await page.waitForTimeout(1400);

    await page.screenshot({ path: `${outDir}/${shot.name}.png`, fullPage: !shot.viewport });
    console.log(`captured ${shot.name}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length > 0) {
  console.error("\nRuntime problems detected:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("\nNo console errors or page exceptions.");
}

/* -------------------------------------------------------------------------- */

async function startServer(dir, listenPort) {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const { extname, join, normalize } = await import("node:path");

  const TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
  };

  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    // Normalise away any `..` before touching the filesystem.
    const relative = normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, "");
    const file = join(dir, relative);

    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  await new Promise((resolve) => server.listen(listenPort, "127.0.0.1", resolve));
  return server;
}
