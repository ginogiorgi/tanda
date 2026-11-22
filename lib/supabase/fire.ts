import { logClientEvent } from "@/lib/telemetry/client";

/**
 * Dispara un RPC sin esperar la respuesta ("poke"). El builder de PostgREST (`supabase.rpc(...)`) es
 * PEREZOSO: la request sale recién cuando alguien llama `.then()`. `void supabase.rpc(...)` no manda
 * nada (así se perdieron durante meses los pokes de `resolve_penalty`/`open_next_round`/
 * `begin_presentation` y todo lo hacía el cron con ~1 s de atraso; feedback 3 #2). El lint lo prohíbe.
 *
 * Un poke que falla no rompe nada (el cron es el respaldo), pero ya no se traga en silencio (feedback 4
 * F): con `label`, el error de PostgREST (`{ error }`, que NO rechaza la promesa) o el rechazo de red se
 * registra en la telemetría (`rpc_error:<label>`, con muestreo).
 */
export function fire(request: PromiseLike<unknown>, label?: string): void {
  Promise.resolve(request).then(
    (res) => {
      const err = rpcError(res);
      if (err && label) logClientEvent(`rpc_error:${label}`, err);
    },
    (e: unknown) => {
      if (label) logClientEvent(`rpc_error:${label}`, { code: "network", message: String(e).slice(0, 200) });
    },
  );
}

function rpcError(res: unknown): { code: string; message: string } | null {
  if (typeof res !== "object" || res === null || !("error" in res)) return null;
  const e = res.error;
  if (typeof e !== "object" || e === null) return null;
  const code = "code" in e && typeof e.code === "string" ? e.code : "unknown";
  const message = "message" in e && typeof e.message === "string" ? e.message.slice(0, 200) : "";
  return { code, message };
}
