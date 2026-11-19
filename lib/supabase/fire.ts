/**
 * Dispara un RPC sin esperar la respuesta ("poke"). El builder de PostgREST (`supabase.rpc(...)`) es
 * PEREZOSO: la request sale recién cuando alguien llama `.then()`. `void supabase.rpc(...)` no manda
 * nada (así se perdieron durante meses los pokes de `resolve_penalty`/`open_next_round`/
 * `begin_presentation` y todo lo hacía el cron con ~1 s de atraso; feedback 3 #2). El lint lo prohíbe.
 */
export function fire(request: PromiseLike<unknown>): void {
  Promise.resolve(request).then(
    () => undefined,
    () => undefined, // un poke que falla no rompe nada: el cron es el respaldo
  );
}
