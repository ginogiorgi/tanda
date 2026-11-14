import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseEnv } from "@/lib/env";

/**
 * Refresca la sesión de Supabase en cada request (cookies). Patrón oficial de
 * @supabase/ssr para App Router. No insertar lógica entre createServerClient y
 * getClaims(). `getClaims()` valida el JWT (ES256) localmente y solo va a la red para
 * refrescarlo si venció; `getUser()` iba a Auth en CADA request, prefetches incluidos
 * (docs/PERF-BASELINE.md).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, publishableKey } = publicSupabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getClaims();

  return supabaseResponse;
}
