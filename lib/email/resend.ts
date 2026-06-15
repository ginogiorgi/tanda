import { resendApiKey } from "@/lib/env";

/** Remitente de los mails de Tanda. El dominio debe estar verificado en Resend. */
const FROM = "Tanda <no-reply@tanda2026.com.ar>";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" };

/**
 * Envía un mail vía la API REST de Resend. **Solo servidor.** Si `RESEND_API_KEY` no está
 * configurada (dev), no rompe: devuelve `not_configured` para que el flujo siga. Ver F2 2.6.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    console.warn("[resend] RESEND_API_KEY sin configurar: no se envió el mail.");
    return { ok: false, reason: "not_configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  if (!res.ok) {
    console.error("[resend] envío falló:", res.status, await res.text());
    return { ok: false, reason: "send_failed" };
  }
  return { ok: true };
}
