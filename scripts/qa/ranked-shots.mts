/**
 * Capturas de la fase G: `/ranking` y la tarjeta ranked de `/jugar`, logueado como una cuenta `qa_*` de
 * `pnpm qa:ranked-sim` (refresh token en artifacts/qa/ranked-sim.sessions.json; se reescribe rotado).
 * Uso: pnpm tsx scripts/qa/ranked-shots.mts [Perfil] → artifacts/qa/ranked-*.png (mobile y desktop).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL!;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const base = process.env.SHOTS_BASE_URL ?? "https://tanda2026.com.ar";
const label = process.argv[2] ?? "Ganadora";
const file = "artifacts/qa/ranked-sim.sessions.json";
const saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await sb.auth.refreshSession({ refresh_token: saved[label]! });
if (error || !data.session) throw new Error(`refresh ${label}: ${error?.message}`);
saved[label] = data.session.refresh_token;
writeFileSync(file, JSON.stringify(saved, null, 2));

// Formato de cookie de @supabase/ssr: "base64-" + base64url(JSON), en trozos de 3180.
const ref = new URL(url).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const chunks = value.match(/.{1,3180}/g) ?? [];
const host = new URL(base).hostname;
const cookies =
  chunks.length === 1
    ? [{ name: `sb-${ref}-auth-token`, value, domain: host, path: "/" }]
    : chunks.map((v, i) => ({ name: `sb-${ref}-auth-token.${i}`, value: v, domain: host, path: "/" }));

const browser = await chromium.launch({ channel: "chrome" });
for (const [tag, viewport] of [
  ["mobile", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
] as const) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${base}/ranking`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `artifacts/qa/ranked-ranking-${tag}.png`, fullPage: true });
  await page.goto(`${base}/jugar`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `artifacts/qa/ranked-jugar-${tag}.png`, fullPage: true });
  console.log(tag, page.url());
  await ctx.close();
}
await browser.close();
