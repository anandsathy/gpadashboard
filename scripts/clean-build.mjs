/**
 * Removes the previously emitted build output from the repository root.
 *
 * The build writes to the repo root so GitHub Pages can serve the default
 * branch directly (see `vite.config.ts`). That means generated files sit beside
 * source, so the clean step has to be exact: it deletes `index.html`, the
 * hashed `assets/` directory, and every file Vite copies out of `app/public`,
 * and nothing else. Anything it does not know about is left alone.
 */
import { readdir, rm } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = fileURLToPath(new URL("../app/public/", import.meta.url));

const targets = new Set(["index.html", "assets"]);

// Whatever is in app/public today is what was copied to the root last time.
for (const entry of await readdir(publicDir).catch(() => [])) {
  targets.add(entry);
}

for (const target of targets) {
  await rm(new URL(target, `file://${root}`), { recursive: true, force: true });
}

console.log(`cleaned ${targets.size} build outputs from the repository root`);
