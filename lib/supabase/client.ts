"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "@/lib/env";

/** Cliente de Supabase para el browser (componentes "use client"). */
export function createClient() {
  const { url, publishableKey } = publicSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
