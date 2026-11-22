import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { feedbackRecipient } from "@/lib/env";
import { sendEmail } from "@/lib/email/resend";
import { buildOpsEmail, opsKey, type OpsEvent } from "@/lib/feedback/auto";

/**
 * `POST /api/ops/notify` (feedback 4 F): avisa por mail lo que registró el watchdog del server
 * (`ops_events`: torneo destrabado, error de un barrido). La llama el cron `tanda-ops-notify` de la DB
 * (pg_net) SOLO cuando hay pendientes. No confía en quien llama: lee los pendientes de la DB, manda un
 * mail por clave (tipo + torneo + paso) si esa clave no se avisó en las últimas 24 h, y los marca
 * notificados. Llamarla de más no manda nada nuevo.
 */
const KINDS = ["round_stall_healed", "tick_error"];
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("ops_events")
    .select("id, created_at, kind, tournament_id, detail")
    .is("notified_at", null)
    .in("kind", KINDS)
    .order("created_at")
    .limit(200);
  if (error) {
    console.error("[ops/notify] pendientes", error.code, error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!pending?.length) return NextResponse.json({ ok: true, mailed: 0 });

  const { data: recent } = await admin
    .from("ops_events")
    .select("kind, tournament_id, detail")
    .eq("mailed", true)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  const alreadyMailed = new Set((recent ?? []).map(opsKey));

  const groups = new Map<string, OpsEvent[]>();
  for (const e of pending) {
    const key = opsKey(e);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const to = feedbackRecipient();
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const mailedIds: number[] = [];
  for (const [key, events] of groups) {
    if (alreadyMailed.has(key) || !to) continue;
    const sent = await sendEmail({ to, ...buildOpsEmail(events, version) });
    if (sent.ok) mailedIds.push(events[0]!.id);
  }

  const now = new Date().toISOString();
  const ids = pending.map((e) => e.id);
  const { error: markError } = await admin.from("ops_events").update({ notified_at: now }).in("id", ids);
  if (markError) console.error("[ops/notify] marcar", markError.code, markError.message);
  if (mailedIds.length) await admin.from("ops_events").update({ mailed: true }).in("id", mailedIds);
  return NextResponse.json({ ok: true, mailed: mailedIds.length });
}
