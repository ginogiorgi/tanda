/**
 * Reportes de bug / pedidos de mejora (feedback 3 #17) — la parte PURA: validar lo que manda el cliente,
 * leer el user agent y armar el mail. Sin red → testeable. La usa `app/api/feedback/route.ts`.
 *
 * El asunto tiene un formato FIJO (`[Tanda] Bug: <primeras palabras>` / `[Tanda] Mejora: …`): el asistente de
 * Gino filtra el Gmail con eso. No cambiarlo. El destinatario sale de `FEEDBACK_TO` (`lib/env.ts`).
 */

export const FEEDBACK_MAX = 1000;
export const FEEDBACK_MIN = 3;

export type FeedbackKind = "bug" | "idea";
export const KIND_LABEL: Record<FeedbackKind, string> = { bug: "Bug", idea: "Mejora" };

/** Contexto técnico que manda el navegador (todo opcional y acotado). */
export type FeedbackClient = {
  viewport: { w: number; h: number } | null;
  screen: { w: number; h: number; dpr: number } | null;
  lang: string | null;
  tz: string | null;
};

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  route: string | null;
  client: FeedbackClient;
}

export type ParseResult =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: "spam" | "invalid_kind" | "too_short" | "too_long" | "bad_request" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : null;
}

function shortText(v: unknown, max: number, re: RegExp): string | null {
  return typeof v === "string" && v.length <= max && re.test(v) ? v : null;
}

/** Saca caracteres de control (salvo salto de línea y tab) y normaliza los saltos. */
function cleanMessage(s: string): string {
  return (
    s
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim()
  );
}

const length = (s: string) => [...s].length;

/** Valida el cuerpo del POST. El honeypot (`website`) lleno = bot → `spam` (la ruta responde ok y descarta). */
export function parseFeedbackInput(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, error: "bad_request" };
  if (typeof body.website === "string" && body.website.trim() !== "") return { ok: false, error: "spam" };
  if (body.kind !== "bug" && body.kind !== "idea") return { ok: false, error: "invalid_kind" };
  if (typeof body.message !== "string") return { ok: false, error: "bad_request" };
  const message = cleanMessage(body.message);
  if (length(message) < FEEDBACK_MIN) return { ok: false, error: "too_short" };
  if (length(message) > FEEDBACK_MAX) return { ok: false, error: "too_long" };

  const route = shortText(body.route, 200, /^\/[\w\-./?=&%~]*$/);
  const c = isRecord(body.client) ? body.client : {};
  const vp = isRecord(c.viewport) ? c.viewport : null;
  const sc = isRecord(c.screen) ? c.screen : null;
  const vw = num(vp?.w, 20000);
  const vh = num(vp?.h, 20000);
  const sw = num(sc?.w, 20000);
  const sh = num(sc?.h, 20000);
  const dpr = num(sc?.dpr, 10);
  return {
    ok: true,
    value: {
      kind: body.kind,
      message,
      route,
      client: {
        viewport: vw !== null && vh !== null ? { w: vw, h: vh } : null,
        screen: sw !== null && sh !== null ? { w: sw, h: sh, dpr: dpr ?? 1 } : null,
        lang: shortText(c.lang, 35, /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/),
        tz: shortText(c.tz, 64, /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/),
      },
    },
  };
}

/** Primeras palabras del mensaje para el asunto: una línea, ≤ 8 palabras y ≤ 60 caracteres (con "…" si corta). */
export function firstWords(message: string, maxWords = 8, maxChars = 60): string {
  const words = message.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let out = "";
  let cut = false;
  for (const [i, w] of words.entries()) {
    if (i >= maxWords) {
      cut = true;
      break;
    }
    const next = out ? `${out} ${w}` : w;
    if (length(next) > maxChars) {
      cut = true;
      if (!out) out = [...w].slice(0, maxChars).join("");
      break;
    }
    out = next;
  }
  return cut ? `${out}…` : out;
}

/** Asunto EXACTO: `[Tanda] Bug: …` / `[Tanda] Mejora: …`. */
export function feedbackSubject(kind: FeedbackKind, message: string): string {
  return `[Tanda] ${KIND_LABEL[kind]}: ${firstWords(message)}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface UserAgentInfo {
  browser: string;
  os: string;
  device: "Celular" | "Tablet" | "Computadora";
}

/** Lectura liviana del user agent (sin dependencias): alcanza para reproducir un bug. */
export function parseUserAgent(ua: string | null): UserAgentInfo {
  const s = ua ?? "";
  const ver = (re: RegExp) => re.exec(s)?.[1]?.split(/[._]/).slice(0, 2).join(".") ?? "";
  const named = (name: string, v: string) => (v ? `${name} ${v}` : name);

  let browser = "Desconocido";
  if (/Edg(e|A|iOS)?\//.test(s)) browser = named("Edge", ver(/Edg(?:e|A|iOS)?\/([\d.]+)/));
  else if (/OPR\//.test(s)) browser = named("Opera", ver(/OPR\/([\d.]+)/));
  else if (/SamsungBrowser\//.test(s)) browser = named("Samsung Internet", ver(/SamsungBrowser\/([\d.]+)/));
  else if (/Firefox\/|FxiOS\//.test(s)) browser = named("Firefox", ver(/(?:Firefox|FxiOS)\/([\d.]+)/));
  else if (/CriOS\//.test(s)) browser = named("Chrome", ver(/CriOS\/([\d.]+)/));
  else if (/Chrome\//.test(s)) browser = named("Chrome", ver(/Chrome\/([\d.]+)/));
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = named("Safari", ver(/Version\/([\d.]+)/));

  let os = "Desconocido";
  if (/iPhone|iPad|iPod/.test(s)) os = named("iOS", ver(/OS ([\d_]+) like Mac/));
  else if (/Android/.test(s)) os = named("Android", ver(/Android ([\d.]+)/));
  else if (/Windows NT/.test(s)) os = "Windows";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Mac OS X/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";

  const tablet = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s));
  const device = tablet ? "Tablet" : /Mobi|iPhone|iPod/.test(s) ? "Celular" : "Computadora";
  return { browser, os, device };
}

export interface ReportContext {
  reportId: string;
  /** null = sin sesión. */
  userId: string | null;
  username: string | null;
  isGuest: boolean;
  createdAt: Date;
  userAgent: string | null;
  version: string | null;
  activeTournament: { id: string; mode: string } | null;
}

/** Fecha y hora de Argentina ("19/11/26, 18:42:05"). */
export function argentinaTime(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
  }).format(d);
}

/** Quién reporta, para el mail: nombre (registrado), "Invitado" o "Invitado (sin sesión)". */
export function reporterLabel(ctx: Pick<ReportContext, "userId" | "username" | "isGuest">): string {
  if (!ctx.userId) return "Invitado (sin sesión)";
  if (ctx.isGuest) return "Invitado";
  return ctx.username ?? "(sin nombre)";
}

/** Arma el mail del reporte: asunto exacto + HTML con todo escapado. Sin mail del usuario ni tokens. */
export function buildReportEmail(input: FeedbackInput, ctx: ReportContext): { subject: string; html: string } {
  const ua = parseUserAgent(ctx.userAgent);
  const c = input.client;
  const rows: [string, string][] = [
    ["Usuario", reporterLabel(ctx)],
    ["Id de usuario", ctx.userId ?? "—"],
    ["Fecha y hora (ART)", argentinaTime(ctx.createdAt)],
    ["Tipo", KIND_LABEL[input.kind]],
    ["Pantalla", input.route ?? "—"],
    ["Dispositivo", `${ua.device} · ${ua.os} · ${ua.browser}`],
    ["Ventana", c.viewport ? `${c.viewport.w}×${c.viewport.h}` : "—"],
    ["Pantalla física", c.screen ? `${c.screen.w}×${c.screen.h} @${c.screen.dpr}x` : "—"],
    ["Idioma / zona", `${c.lang ?? "—"} · ${c.tz ?? "—"}`],
    ["Torneo activo", ctx.activeTournament ? `${ctx.activeTournament.mode} · ${ctx.activeTournament.id}` : "—"],
    ["Versión", ctx.version ? ctx.version.slice(0, 7) : "local"],
    ["User agent", ctx.userAgent ? ctx.userAgent.slice(0, 300) : "—"],
    ["Reporte", ctx.reportId],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b665b;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:system-ui,sans-serif;color:#141414;max-width:640px">
<h2 style="margin:0 0 12px">${escapeHtml(KIND_LABEL[input.kind])} reportado en Tanda</h2>
<p style="white-space:pre-wrap;border-left:4px solid #d7261e;padding:8px 12px;background:#f7f4ec;margin:0 0 16px">${escapeHtml(input.message)}</p>
<table style="border-collapse:collapse;font-size:14px">${table}</table>
</div>`;
  return { subject: feedbackSubject(input.kind, input.message), html };
}
