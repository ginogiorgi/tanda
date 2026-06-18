"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/** Cliente de Supabase para el browser (componentes "use client"). */
export function createClient() {
  const { url, publishableKey } = publicSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
