/**
 * QA visual del avatar (feedback 2, P7a.1): recorre la matriz cuerpo × pieza × vista × pose sobre
 * `/dev/avatar/qa` y guarda las capturas + una hoja de contactos (`index.html`) en
 * `artifacts/avatar-qa/<sha>/`. No se commitean PNG: en CI se suben como artefacto.
 *
 *   pnpm dev -p 3301 &   QA_BASE_URL=http://localhost:3301 pnpm qa:avatar
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.QA_BASE_URL ?? "http://localhost:3301";
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
const out = join(import.meta.dirname, "..", "..", "artifacts", "avatar-qa", sha);
mkdirSync(out, { recursive: true });

type Shot = { row: string; col: string; query: string };
const shots: Shot[] = [];
const HAIR: Record<string, string[]> = { male: ["none", "buzz", "parted", "long", "bun"], female: ["none", "buzz", "long", "bun"] };
const SKINS = ["#F2D3BC", "#E0B593", "#C68E66", "#A06B45", "#764A2E", "#4D3020"];
for (const body of ["male", "female"]) {
  for (const hair of HAIR[body]!) {
    for (const view of ["head", "headback", "top", "side"]) {
      shots.push({ row: `pelo ${hair} · ${body}`, col: view, query: `body=${body}&hair=${hair}&view=${view}` });
    }
    shots.push({ row: `pelo ${hair} · ${body}`, col: "canoso", query: `body=${body}&hair=${hair}&view=head&hc=%23A9A6A0` });
  }
  for (const view of ["feet", "low", "side"]) {
    shots.push({ row: `botín · ${body}`, col: view, query: `body=${body}&view=${view}` });
  }
  for (const [i, sk] of SKINS.entries()) {
    shots.push({ row: `piel · ${body}`, col: `s${i + 1}`, query: `body=${body}&view=head&sk=${encodeURIComponent(sk)}` });
  }
  for (const pose of ["ready", "kick", "dive", "celebrate"]) {
    shots.push({ row: `poses · ${body}`, col: pose, query: `body=${body}&hair=${body === "male" ? "parted" : "long"}&view=q34&pose=${pose}` });
  }
}

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));

const file = (s: Shot) => `${s.row}-${s.col}`.replace(/[^a-z0-9]+/gi, "_") + ".png";
for (const s of shots) {
  await page.goto(`${base}/dev/avatar/qa?${s.query}`);
  await page.locator("[data-qa-ready='1']").waitFor({ timeout: 60_000 });
  await page.screenshot({ path: join(out, file(s)), clip: { x: 0, y: 0, width: 768, height: 768 } });
  process.stdout.write(".");
}
await page.setViewportSize({ width: 768, height: 1200 });
await page.goto(`${base}/dev/avatar/qa?sheet=swatches`);
await page.locator("[data-qa-ready='1']").waitFor();
await page.screenshot({ path: join(out, "swatches.png"), fullPage: true });
await browser.close();

const rows = [...new Set(shots.map((s) => s.row))];
const html = `<!doctype html><meta charset="utf-8"><title>Avatar QA ${sha}</title>
<style>body{font:12px system-ui;background:#ede9df}td{padding:2px;vertical-align:top}img{width:192px;display:block}</style>
<h1>Avatar QA · ${sha}</h1><p><img src="swatches.png" style="width:384px"></p><table>${rows
  .map(
    (r) =>
      `<tr><th>${r}</th>${shots
        .filter((s) => s.row === r)
        .map((s) => `<td><img src="${file(s)}"><small>${s.col}</small></td>`)
        .join("")}</tr>`,
  )
  .join("")}</table>`;
writeFileSync(join(out, "index.html"), html);
console.log(`\n✓ ${shots.length} capturas + lámina → ${out}/index.html`);
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
