/**
 * `fetch` para los clientes de Supabase que tolera el "JWT issued at future" de PostgREST.
 *
 * Un token recién emitido (sign-in anónimo/login) puede llegar a PostgREST antes de que su reloj
 * —cacheado al segundo— alcance el `iat` del token → 401 `PGRST303` aunque el token sea válido. Visto en
 * el e2e: el home pedía `profiles` al instante del sign-in del invitado, recibía 401, renderizaba el
 * landing y el botón quedaba en "Entrando…" (rama wip/fix-guest). Se reintenta UNA vez tras esperar
 * a que pase el segundo; cualquier otra respuesta pasa tal cual.
 */

export const IAT_RETRY_DELAY_MS = 1100;

type Fetch = typeof fetch;

/** ¿La respuesta es el 401 de PostgREST por `iat` en el futuro? (lee una copia del body). */
async function isIatInFuture(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body: unknown = await res.clone().json();
    return typeof body === "object" && body !== null && "code" in body && body.code === "PGRST303"
      && "message" in body && typeof body.message === "string" && /issued at future/i.test(body.message);
  } catch {
    return false;
  }
}

export function withIatRetry(
  base: Fetch = (input, init) => fetch(input, init), // el global de turno (Next lo parchea)
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Fetch {
  return async (input, init) => {
    // Un body de stream no se puede reenviar; los de Supabase son strings → re-enviables.
    const res = await base(input, init);
    if (!(await isIatInFuture(res))) return res;
    await wait(IAT_RETRY_DELAY_MS);
    // En un Server Component, Next memoiza los fetch GET por URL+headers durante el render
    // (`dedupeFetch`): reintentar con los mismos argumentos devolvía el MISMO 401 cacheado sin salir a
    // la red → `game_modes`/`profiles` nunca se reintentaban (flake "Próximamente"; los POST/RPC sí).
    // Un `signal` propio es la salida documentada de esa memoización.
    return base(input, { ...init, signal: init?.signal ?? new AbortController().signal });
  };
}
