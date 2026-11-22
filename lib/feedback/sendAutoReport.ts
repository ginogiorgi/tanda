/**
 * Cliente del reporte automático (feedback 4 F): lo llama la pantalla de error al montarse. Un mismo
 * error se manda una sola vez por carga de página (StrictMode monta dos veces, y "Reintentar" puede
 * volver a caer en el mismo error); el resto de la deduplicación la hace el server por fingerprint.
 * Nunca tira: si no hay red, el reporte se pierde y la pantalla sigue igual.
 */
export type AutoReportSource = "route" | "global" | "game";

export interface ReportableError {
  message?: string;
  stack?: string;
  digest?: string;
}

const STACK_LINES = 8;
const sentKeys = new Set<string>();

/** Stack abreviado: las primeras líneas, sin el origen del sitio (no aporta y alarga el mail). */
export function shortStack(stack: string | undefined, origin: string): string | null {
  if (!stack) return null;
  return stack.split("\n").slice(0, STACK_LINES).join("\n").split(origin).join("").slice(0, 1500);
}

export function sendAutoReport(error: ReportableError, source: AutoReportSource): boolean {
  if (typeof window === "undefined") return false;
  const route = window.location.pathname;
  const key = `${source}|${route}|${error.digest ?? ""}|${error.message ?? ""}`;
  if (sentKeys.has(key)) return false;
  sentKeys.add(key);
  // Sentry entero (puente + SDK) se baja recién acá: no suma a la carga inicial de ninguna ruta.
  import("@/lib/telemetry/sentry").then(
    (m) => m.captureErrorToSentry(error, source),
    () => undefined,
  );
  try {
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kind: "auto",
        source,
        message: (error.message ?? "").slice(0, 300),
        stack: shortStack(error.stack, window.location.origin),
        digest: error.digest ?? null,
        route,
      }),
    }).catch(() => undefined);
  } catch {
    // sin fetch/red: se pierde el reporte, la pantalla sigue
  }
  return true;
}

/** Solo tests. */
export function resetAutoReportsForTests(): void {
  sentKeys.clear();
}
