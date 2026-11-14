/**
 * Cliente de Supabase del browser BAJO DEMANDA (F4, presupuesto de JS). `@supabase/supabase-js` pesa
 * ~66 KB gz (auth + realtime + postgrest); en las pantallas que solo lo usan al tocar un botón (entrar,
 * registrarse, invitado, salir, jugar) se baja recién en ese momento en vez de ir en la carga inicial.
 * Las pantallas de juego, que abren realtime al montar, importan `@/lib/supabase/client` directo.
 */
export async function browserClient() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}
