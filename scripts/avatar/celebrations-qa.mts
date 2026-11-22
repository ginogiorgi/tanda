/**
 * QA visual de los festejos (feedback 4 #16): por cada festejo, cuadros cada 0,2 s en tres vistas (de frente,
 * 3/4 y "dron" como el juego) sobre `/dev/avatar/qa`, una hoja de contactos por festejo (montage) y un video
 * por vista (ffmpeg). Todo en `artifacts/celebrations/<sha>/` (no se commitea).
 *
 *   pnpm dev -p 3301 &   QA_BASE_URL=http://localhost:3301 pnpm qa:celebrations [siu,sky]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { CELEBRATION_IDS, CELEBRATIONS, isCelebrationId } from "../../lib/avatar/celebrations";

const base = process.env.QA_BASE_URL ?? "http://localhost:3301";
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
const out = join(import.meta.dirname, "..", "..", "artifacts", "celebrations", sha);
const only = (process.argv[2] ?? "").split(",").filter(isCelebrationId);
const ids = only.length ? only : [...CELEBRATION_IDS];
const VIEWS = ["wide", "wideq34", "drone"] as const;
const STEP = Number(process.env.QA_STEP ?? 0.2);
const BODY = process.env.QA_BODY ?? "male";

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));

for (const id of ids) {
  const dir = join(out, id);
  mkdirSync(dir, { recursive: true });
  const dur = CELEBRATIONS[id].duration;
  const times: number[] = [];
  for (let t = 0; t <= dur + 1e-6; t += STEP) times.push(Math.round(t * 100) / 100);
  for (const view of VIEWS) {
    for (const [i, t] of times.entries()) {
      await page.goto(`${base}/dev/avatar/qa?body=${BODY}&hair=parted&view=${view}&pose=cel-${id}&t=${t}`);
      await page.locator("[data-qa-ready='1']").waitFor({ timeout: 60_000 });
      await page.screenshot({ path: join(dir, `${view}-${String(i).padStart(2, "0")}.png`), clip: { x: 0, y: 0, width: 768, height: 768 } });
      process.stdout.write(".");
    }
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(1 / STEP), "-i", join(dir, `${view}-%02d.png`), "-vf", "scale=384:-2", "-pix_fmt", "yuv420p", join(dir, `${view}.mp4`)]);
  }
  // Hoja de contactos: una fila por vista, una columna por instante.
  const files = VIEWS.flatMap((v) => times.map((_, i) => join(dir, `${v}-${String(i).padStart(2, "0")}.png`)));
  execFileSync("montage", [...files, "-tile", `${times.length}x${VIEWS.length}`, "-geometry", "192x192+2+2", "-background", "#ede9df", join(out, `${id}.png`)]);
  console.log(`\n${id}: ${join(out, `${id}.png`)}`);
}
await browser.close();
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
