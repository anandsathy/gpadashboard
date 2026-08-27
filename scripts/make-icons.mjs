/**
 * Renders the PNG app icons from `app/public/icon.svg`.
 *
 * Run with `npm run icons` after changing the mark. The output is committed, so
 * a normal build and a CI run never need a browser.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";

const publicDir = fileURLToPath(new URL("../app/public/", import.meta.url));
const svg = await readFile(`${publicDir}icon.svg`, "utf8");

/** Maskable icons need the mark inset so a circular crop cannot clip it. */
const TARGETS = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  { file: "icon-180.png", size: 180, padding: 0 },
  { file: "icon-maskable.png", size: 512, padding: 0.12 },
];

// Honour a preinstalled browser when the environment provides one, so this
// works both on a laptop with `npx playwright install` and in a sandbox that
// ships Chromium at a fixed path.
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

try {
  for (const { file, size, padding } of TARGETS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });

    const inset = Math.round(size * padding);

    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#014421">
         <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
           <div style="width:${size - inset * 2}px;height:${size - inset * 2}px">${svg}</div>
         </div>
       </body></html>`,
    );

    const shot = await page.screenshot({ type: "png" });
    await writeFile(`${publicDir}${file}`, shot);
    await page.close();
    console.log(`wrote ${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
