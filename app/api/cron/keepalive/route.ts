import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `GET /api/cron/keepalive` (Plan 5 O1): el plan free de Supabase pausa el proyecto tras ~7 días sin
 * actividad de API, y pg_cron (adentro de la DB) no cuenta. El cron de Vercel (`vercel.json`, 1 por día, lo
 * que permite Hobby) hace una lectura real por PostgREST. Barata e inofensiva; con `CRON_SECRET` configurado,
 * solo la acepta del cron de Vercel.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { count, error } = await createAdminClient()
    .from("game_modes")
    .select("id", { count: "exact", head: true });
  if (error) {
    console.error("[keepalive]", error.code, error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, modes: count });
}
