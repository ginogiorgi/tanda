import { handleTunnelRequest } from "@sentry/nextjs";

/**
 * Túnel de Sentry (feedback 4 F): el cliente manda sus eventos acá (mismo origen → la CSP no cambia y los
 * bloqueadores no los tiran) y el server los reenvía a Sentry SIN cookies. Solo acepta envelopes de
 * NUESTRO DSN (403 para cualquier otro: no es un proxy abierto); sin DSN configurado, 404.
 */
export function POST(request: Request): Promise<Response> | Response {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return new Response(null, { status: 404 });
  return handleTunnelRequest(request, { allowedDsns: [dsn] });
}
