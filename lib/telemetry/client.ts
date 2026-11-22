/**
 * Telemetría propia del cliente (feedback 4 F). `logClientEvent` registra en `client_events` (RPC
 * `log_client_event`, rate limit en el server) y lo pasa al reporter externo si hay uno (Sentry, ver
 * `setExternalReporter`). NUNCA tira ni bloquea: si falla, se pierde el evento y el juego sigue.
 *
 * Muestreo: el mismo `kind` sale como mucho una vez cada `KIND_GAP_MS` y una sesión manda como mucho
 * `SESSION_CAP` eventos (una pestaña con la red caída no satura nada).
 */
import { browserClient } from "@/lib/supabase/lazy";

export const KIND_GAP_MS = 60_000;
export const SESSION_CAP = 20;

type Detail = Record<string, string | number | boolean | null>;
type ExternalReporter = (kind: string, detail: Detail) => void;

const lastByKind = new Map<string, number>();
let sent = 0;
let external: ExternalReporter | null = null;

/** Lo registra el init de Sentry del cliente; sin Sentry, solo queda la telemetría propia. */
export function setExternalReporter(r: ExternalReporter | null): void {
  external = r;
}

/** Solo tests: vuelve el muestreo a cero. */
export function resetTelemetryForTests(): void {
  lastByKind.clear();
  sent = 0;
  external = null;
}

function currentRoute(): string | null {
  return typeof window === "undefined" ? null : window.location.pathname.slice(0, 200);
}

export function logClientEvent(kind: string, detail: Detail = {}, now = Date.now()): boolean {
  const last = lastByKind.get(kind);
  if (sent >= SESSION_CAP || (last != null && now - last < KIND_GAP_MS)) return false;
  lastByKind.set(kind, now);
  sent++;
  try {
    external?.(kind, detail);
  } catch {
    // el reporter externo nunca rompe el juego
  }
  const route = currentRoute();
  // No va por `fire()`: la telemetría no se reporta a sí misma. Cliente bajo demanda (no suma a la carga
  // inicial); `.then` dispara el builder perezoso. Sin env/cliente (tests, SSR) solo se pierde el evento.
  browserClient()
    .then((supabase) => supabase.rpc("log_client_event", { p_kind: kind, p_route: route, p_detail: detail }))
    .then(
      () => undefined,
      () => undefined,
    );
  return true;
}
