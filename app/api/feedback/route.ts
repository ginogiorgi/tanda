import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { feedbackRecipient, secretKey } from "@/lib/env";
import { sendEmail } from "@/lib/email/resend";
import { buildReportEmail, parseFeedbackInput } from "@/lib/feedback/report";
import { autoFingerprint, buildAutoReportEmail, parseAutoReport, type AutoReportInput } from "@/lib/feedback/auto";

/**
 * `POST /api/feedback` (feedback 3 #17): guarda el reporte (tabla `feedback_reports`, vía `submit_feedback`
 * con la service role: límite 5/h y 20/día por usuario e IP) y lo manda por mail a `FEEDBACK_TO` con Resend.
 * Si el mail falla, el reporte queda guardado (`emailed = false`) y al usuario se le confirma igual.
 * Honeypot lleno → 200 sin guardar nada. La IP nunca se guarda en claro (HMAC con la clave del server).
 *
 * `kind: "auto"` (feedback 4 F): lo manda sola la pantalla de error. Se deduplica por fingerprint
 * (`submit_auto_report`): una fila con contador y un mail como mucho cada 24 h por fingerprint.
 */
const MAX_BODY = 8 * 1024;

type Reply = { ok: true } | { ok: false; error: string };

function reply(body: Reply, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "unknown";
}

/** Quién reporta y desde dónde (compartido por los reportes manuales y los automáticos). */
async function reporter(req: NextRequest) {
  const { supabase, user } = await getSession();
  let username: string | null = null;
  let activeTournament: { id: string; mode: string } | null = null;
  if (user) {
    const [profile, active] = await Promise.all([
      user.isAnonymous
        ? Promise.resolve(null)
        : supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
      supabase.rpc("get_active_tournament"),
    ]);
    username = profile?.data?.username ?? null;
    if (active.data?.tournament_id) activeTournament = { id: active.data.tournament_id, mode: active.data.mode_id };
  }
  const ipHash = createHmac("sha256", secretKey()).update(`feedback:${clientIp(req)}`).digest("hex");
  const userAgent = req.headers.get("user-agent");
  return { user, username, activeTournament, ipHash, userAgent };
}

async function handleAuto(req: NextRequest, input: AutoReportInput) {
  const { user, username, activeTournament, ipHash, userAgent } = await reporter(req);
  const fingerprint = autoFingerprint(input);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("submit_auto_report", {
    p_fingerprint: fingerprint,
    p_user: user?.id ?? null,
    p_message: input.message,
    p_route: input.route,
    p_meta: {
      source: input.source,
      digest: input.digest,
      stack: input.stack,
      user_agent: userAgent?.slice(0, 300) ?? null,
      guest: user?.isAnonymous ?? null,
      tournament: activeTournament,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    p_ip_hash: ipHash,
  });
  const row = data?.[0];
  if (error || !row) {
    if (error?.message.includes("rate_limited")) return reply({ ok: false, error: "rate_limited" }, 429);
    console.error("[feedback] submit_auto_report", error?.code, error?.message);
    return reply({ ok: false, error: "server_error" }, 500);
  }
  const to = feedbackRecipient();
  if (row.notify && to) {
    const mail = buildAutoReportEmail(input, {
      reportId: row.id,
      userId: user?.id ?? null,
      username,
      isGuest: user?.isAnonymous ?? false,
      createdAt: new Date(),
      userAgent,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      activeTournament,
      occurrences: row.occurrences,
      fingerprint,
    });
    const sent = await sendEmail({ to, ...mail });
    if (sent.ok) {
      const { error: markError } = await admin
        .from("feedback_reports")
        .update({ emailed: true, emailed_at: new Date().toISOString() })
        .eq("id", row.id);
      if (markError) console.error("[feedback] marcar emailed (auto)", markError.code, markError.message);
    }
  }
  return reply({ ok: true });
}

export async function POST(req: NextRequest) {
  // Solo desde la propia app (el formulario): un Origin ajeno no reporta.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return reply({ ok: false, error: "forbidden" }, 403);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ ok: false, error: "too_long" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ ok: false, error: "bad_request" }, 400);
  }
  if (typeof body === "object" && body !== null && "kind" in body && body.kind === "auto") {
    const auto = parseAutoReport(body);
    if (!auto) return reply({ ok: false, error: "bad_request" }, 400);
    return handleAuto(req, auto);
  }

  const parsed = parseFeedbackInput(body);
  if (!parsed.ok) {
    if (parsed.error === "spam") return reply({ ok: true });
    return reply({ ok: false, error: parsed.error }, 400);
  }
  const input = parsed.value;

  const { user, username, activeTournament, ipHash, userAgent } = await reporter(req);
  const admin = createAdminClient();
  const { data: reportId, error } = await admin.rpc("submit_feedback", {
    p_user: user?.id ?? null,
    p_username: username,
    p_kind: input.kind,
    p_message: input.message,
    p_route: input.route,
    p_meta: {
      client: input.client,
      user_agent: userAgent?.slice(0, 300) ?? null,
      guest: user?.isAnonymous ?? null,
      tournament: activeTournament,
    },
    p_ip_hash: ipHash,
  });
  if (error || !reportId) {
    if (error?.message.includes("rate_limited")) return reply({ ok: false, error: "rate_limited" }, 429);
    console.error("[feedback] submit_feedback", error?.code, error?.message);
    return reply({ ok: false, error: "server_error" }, 500);
  }

  const to = feedbackRecipient();
  if (to) {
    const mail = buildReportEmail(input, {
      reportId,
      userId: user?.id ?? null,
      username,
      isGuest: user?.isAnonymous ?? false,
      createdAt: new Date(),
      userAgent,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      activeTournament,
    });
    const sent = await sendEmail({ to, ...mail });
    if (sent.ok) {
      const { error: markError } = await admin.from("feedback_reports").update({ emailed: true }).eq("id", reportId);
      if (markError) console.error("[feedback] marcar emailed", markError.code, markError.message);
    }
  } else {
    console.warn("[feedback] FEEDBACK_TO sin configurar: reporte guardado, no se mandó el mail.");
  }
  return reply({ ok: true });
}
