/**
 * Reportes AUTOMÁTICOS (feedback 4 F): los manda sola la pantalla de error al montarse. Parte pura (sin
 * red) → testeable. El server deduplica por `fingerprint` (mensaje + ruta + primer frame, normalizados
 * para que el mismo bug en otra partida dé el mismo hash) y manda como mucho un mail cada 24 h por
 * fingerprint, con el contador de ocurrencias. Mismo destinatario y mismo prefijo de asunto
 * (`[Tanda] Bug: …`) que los reportes manuales: el asistente de Gino filtra con eso.
 */
import { createHash } from "node:crypto";
import { argentinaTime, escapeHtml, feedbackSubject, parseUserAgent, reporterLabel, type ReportContext } from "./report";

export interface AutoReportInput {
  message: string;
  /** Stack abreviado (primeras líneas), sin rutas absolutas del server. */
  stack: string | null;
  /** `error.digest` de Next (errores de Server Components: el mensaje real queda en los logs). */
  digest: string | null;
  route: string | null;
  /** De dónde viene: boundary de ruta, global o el juego trabado. */
  source: "route" | "global" | "game";
}

export const AUTO_MESSAGE_MAX = 300;
export const AUTO_STACK_MAX = 1500;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

export function parseAutoReport(body: unknown): AutoReportInput | null {
  if (!isRecord(body) || body.kind !== "auto") return null;
  const message = typeof body.message === "string" ? clean(body.message).slice(0, AUTO_MESSAGE_MAX) : "";
  const stack = typeof body.stack === "string" ? clean(body.stack).slice(0, AUTO_STACK_MAX) || null : null;
  const digest = typeof body.digest === "string" && /^[\w-]{1,64}$/.test(body.digest) ? body.digest : null;
  const route =
    typeof body.route === "string" && body.route.length <= 200 && /^\/[\w\-./?=&%~]*$/.test(body.route)
      ? body.route
      : null;
  const source = body.source === "global" || body.source === "game" ? body.source : "route";
  if (!message && !digest) return null;
  return { message: message || "(sin mensaje)", stack, digest, route, source };
}

/** Ruta sin ids ni query: `/sala/AB12C?x=1` y `/sala/ZZ99Q` son la misma pantalla. */
export function normalizeRoute(route: string | null): string {
  if (!route) return "-";
  return route
    .split("?")[0]!
    .split("/")
    .map((seg) => (/^[0-9a-f-]{16,}$/i.test(seg) || /\d/.test(seg) ? ":id" : seg))
    .join("/");
}

/** Mensaje sin números, uuids ni hashes: "Penal 3f2a… no existe (idx 7)" ≈ "Penal # no existe (idx #)". */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "#")
    .replace(/\b[0-9a-f]{12,}\b/gi, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/** Primer frame del stack, sin línea/columna ni hash de chunk (cambian entre deploys). */
export function firstFrame(stack: string | null): string {
  const line = stack
    ?.split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ") || /@/.test(l));
  if (!line) return "-";
  return line
    .replace(/:\d+(:\d+)?\)?$/, "")
    .replace(/[-.][0-9a-f]{8,}(?=\.js)/gi, "")
    .replace(/\?[^\s)]*/g, "");
}

export function autoFingerprint(input: Pick<AutoReportInput, "message" | "route" | "stack" | "digest">): string {
  const key = [
    normalizeMessage(input.message),
    normalizeRoute(input.route),
    // Sin stack (errores de server) el digest identifica el error; con stack, el frame alcanza.
    input.stack ? firstFrame(input.stack) : (input.digest ?? "-"),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export function buildAutoReportEmail(
  input: AutoReportInput,
  ctx: ReportContext & { occurrences: number; fingerprint: string },
): { subject: string; html: string } {
  const ua = parseUserAgent(ctx.userAgent);
  const rows: [string, string][] = [
    ["Usuario", reporterLabel(ctx)],
    ["Id de usuario", ctx.userId ?? "—"],
    ["Fecha y hora (ART)", argentinaTime(ctx.createdAt)],
    ["Origen", input.source === "game" ? "Juego trabado" : input.source === "global" ? "Error global" : "Pantalla de error"],
    ["Pantalla", input.route ?? "—"],
    ["Ocurrencias", String(ctx.occurrences)],
    ["Digest", input.digest ?? "—"],
    ["Dispositivo", `${ua.device} · ${ua.os} · ${ua.browser}`],
    ["Torneo activo", ctx.activeTournament ? `${ctx.activeTournament.mode} · ${ctx.activeTournament.id}` : "—"],
    ["Versión", ctx.version ? ctx.version.slice(0, 7) : "local"],
    ["Fingerprint", ctx.fingerprint],
    ["Reporte", ctx.reportId],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b665b;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const stack = input.stack
    ? `<pre style="font-size:12px;white-space:pre-wrap;background:#f7f4ec;padding:8px 12px;margin:0 0 16px">${escapeHtml(input.stack)}</pre>`
    : "";
  const html = `<div style="font-family:system-ui,sans-serif;color:#141414;max-width:640px">
<h2 style="margin:0 0 12px">Error automático en Tanda</h2>
<p style="white-space:pre-wrap;border-left:4px solid #d7261e;padding:8px 12px;background:#f7f4ec;margin:0 0 16px">${escapeHtml(input.message)}</p>
${stack}<table style="border-collapse:collapse;font-size:14px">${table}</table>
<p style="font-size:12px;color:#6b665b">Llega como mucho un mail cada 24 h por error; el contador sigue sumando en feedback_reports.</p>
</div>`;
  return { subject: feedbackSubject("bug", `(auto) ${input.message}`), html };
}

export interface OpsEvent {
  id: number;
  created_at: string;
  kind: string;
  tournament_id: string | null;
  detail: unknown;
}

const OPS_LABEL: Record<string, string> = {
  round_stall_healed: "torneo trabado destrabado por el watchdog",
  tick_error: "error en un barrido de tick()",
};

/** Clave de deduplicación de un evento operativo: tipo + torneo + paso del barrido. */
export function opsKey(e: Pick<OpsEvent, "kind" | "tournament_id" | "detail">): string {
  const step = isRecord(e.detail) && typeof e.detail.step === "string" ? e.detail.step : "-";
  return `${e.kind}|${e.tournament_id ?? "-"}|${step}`;
}

export function buildOpsEmail(events: OpsEvent[], version: string | null): { subject: string; html: string } {
  const first = events[0]!;
  const label = OPS_LABEL[first.kind] ?? first.kind;
  const rows = events
    .map(
      (e) =>
        `<tr><td style="padding:4px 12px 4px 0;white-space:nowrap;vertical-align:top">${escapeHtml(argentinaTime(new Date(e.created_at)))}</td><td style="padding:4px 12px 4px 0;vertical-align:top">${escapeHtml(e.kind)}</td><td style="padding:4px 12px 4px 0;vertical-align:top">${escapeHtml(e.tournament_id ?? "—")}</td><td style="padding:4px 0"><code>${escapeHtml(JSON.stringify(e.detail).slice(0, 400))}</code></td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:system-ui,sans-serif;color:#141414;max-width:720px">
<h2 style="margin:0 0 12px">Aviso del server de Tanda</h2>
<p style="border-left:4px solid #d7261e;padding:8px 12px;background:#f7f4ec;margin:0 0 16px">${escapeHtml(label)} (${events.length})</p>
<table style="border-collapse:collapse;font-size:13px">${rows}</table>
<p style="font-size:12px;color:#6b665b">Versión ${escapeHtml(version ? version.slice(0, 7) : "local")}. Un mail por tipo de evento cada 24 h; el resto queda en ops_events.</p>
</div>`;
  return { subject: feedbackSubject("bug", `(server) ${label}`), html };
}
