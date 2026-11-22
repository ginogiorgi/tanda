/**
 * Sentry en el cliente, PEREZOSO (feedback 4 F): el SDK no entra en la carga inicial de ninguna ruta;
 * se baja recién la primera vez que hay algo para reportar (pantalla de error o evento de telemetría).
 * Solo en Vercel (`NEXT_PUBLIC_VERCEL_ENV`): en local y en los e2e no manda nada.
 *
 * Privacidad: sin PII (`dataCollection` todo apagado: ni IP, cookies, headers, bodies ni query), sin replays ni trazas; el usuario va como hash del id
 * (para contar afectados, no para identificarlos). Los envíos pasan por `/sentry-tunnel` (mismo origen →
 * la CSP no cambia y los bloqueadores no los tiran).
 */
import type { ReportableError } from "@/lib/feedback/sendAutoReport";
import { browserClient } from "@/lib/supabase/lazy";

type SentryModule = typeof import("@sentry/nextjs");
type Detail = Record<string, string | number | boolean | null>;

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NEXT_PUBLIC_VERCEL_ENV;
export const TUNNEL_PATH = "/sentry-tunnel";

let loading: Promise<SentryModule | null> | null = null;

export function sentryEnabled(): boolean {
  return typeof window !== "undefined" && !!DSN && !!ENV;
}

/** sha256 del id → 16 hex: estable por usuario, no reversible. */
export async function hashUserId(id: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tanda:${id}`));
  return Array.from(new Uint8Array(bytes).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function load(): Promise<SentryModule | null> {
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tunnel: TUNNEL_PATH,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    // Sin integraciones por defecto que capturen solas (consola, breadcrumbs de fetch con URLs): lo que
    // llega a Sentry es exactamente lo que reportamos nosotros.
    defaultIntegrations: false,
    integrations: [Sentry.dedupeIntegration(), Sentry.linkedErrorsIntegration()],
  });
  try {
    const supabase = await browserClient();
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (id) Sentry.setUser({ id: await hashUserId(id) });
  } catch {
    // sin sesión: el evento va anónimo
  }
  return Sentry;
}

function sentry(): Promise<SentryModule | null> {
  if (!sentryEnabled()) return Promise.resolve(null);
  loading ??= load().catch(() => null);
  return loading;
}

/** Pantalla de error / juego trabado. Nunca tira. */
export function captureErrorToSentry(error: ReportableError, source: string): void {
  void sentry().then((S) => {
    if (!S) return;
    const err = Object.assign(new Error(error.message || "(sin mensaje)"), { stack: error.stack });
    S.captureException(err, { tags: { source, digest: error.digest ?? "-" } });
  });
}

/** Evento de telemetría propia (`logClientEvent`): llega como warning agrupado por `kind`. */
export function captureEventToSentry(kind: string, detail: Detail): void {
  void sentry().then((S) => {
    S?.captureMessage(kind, { level: "warning", fingerprint: [kind], extra: detail, tags: { kind } });
  });
}
