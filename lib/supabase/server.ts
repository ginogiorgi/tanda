import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseEnv } from "@/lib/env";

/**
 * Cliente de Supabase para el servidor (Server Components, Route Handlers,
 * Server Actions). Lee/escribe la sesión vía cookies. La sesión se refresca
 * en el middleware (se agrega en F2).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: ignorable si el middleware
          // ya refresca la sesión.
        }
      },
    },
  });
}
