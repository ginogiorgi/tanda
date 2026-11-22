import * as Sentry from "@sentry/nextjs";

/**
 * Sentry en el server (feedback 4 F): errores de Server Components / route handlers (`onRequestError`).
 * Solo en Vercel; sin PII ni trazas. El túnel del cliente es `app/sentry-tunnel/route.ts`.
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || !process.env.VERCEL_ENV || process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
