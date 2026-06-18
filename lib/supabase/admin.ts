import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv, secretKey } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente admin de Supabase (service-role vía `secretKey`). **Solo servidor** (Server
 * Actions / Route Handlers): saltea RLS, así que jamás debe importarse en código de
 * cliente. Sin sesión persistente. Se usa para `auth.admin.*` (p. ej. generar el link de
 * recuperación). Ver SPEC §2 / F2 2.6.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  return createClient<Database>(url, secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
