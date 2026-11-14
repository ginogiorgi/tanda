import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Sesión del request para Server Components / Server Actions — la ÚNICA puerta de entrada (regla de
 * lint: `auth.getUser()` está prohibido fuera de acá).
 *
 * Por qué `getClaims()` y no `getUser()`: el proyecto firma los JWT con ES256 (claves asimétricas), así
 * que `getClaims()` valida la firma localmente contra el JWKS cacheado, sin ir a Auth. `getUser()` es
 * una ida de red a Auth en cada página; con las funciones lejos de la DB (ver docs/PERF-BASELINE.md)
 * era la mitad del delay de cada toque. Si el token venció, `getClaims()` lo refresca (como antes).
 *
 * `cache()` → una sola validación por request aunque layout y página la pidan.
 */
export interface SessionUser {
  id: string;
  isAnonymous: boolean;
  /** `user_metadata` del JWT (al momento de emitirse: para datos que cambian, ver `freshUser`). */
  metadata: Record<string, unknown>;
}

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user: SessionUser | null = claims
    ? {
        id: claims.sub,
        isAnonymous: claims.is_anonymous === true,
        metadata: isRecord(claims.user_metadata) ? claims.user_metadata : {},
      }
    : null;
  return { supabase, user };
});

/**
 * Lectura FRESCA del usuario desde Auth (una ida de red). Solo para datos que el usuario cambia y el
 * JWT no refleja hasta refrescarse (p. ej. el email de recuperación en el perfil).
 */
export async function freshUserMetadata(): Promise<Record<string, unknown>> {
  const { supabase } = await getSession();
  // eslint-disable-next-line no-restricted-syntax -- única lectura fresca permitida (ver doc arriba)
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata ?? {};
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
