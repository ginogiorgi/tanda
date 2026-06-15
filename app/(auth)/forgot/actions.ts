"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { siteUrl } from "@/lib/env";
import { isValidUsername, usernameToEmail } from "@/lib/auth";

export interface RequestResetResult {
  /** Mensaje genérico para mostrar (mismo texto exista o no la cuenta: anti-enumeración). */
  ok: boolean;
  error?: string;
}

const GENERIC_OK =
  "Si esa cuenta tiene un email cargado, te mandamos un link para restablecer la contraseña.";

/**
 * Dispara la recuperación de contraseña por username. El email sintético del login queda
 * intacto: usamos el admin API para generar un link de recovery y lo enviamos al **email de
 * recuperación** guardado en `user_metadata`. Nunca revela si la cuenta existe o tiene email
 * (siempre devuelve el mismo mensaje). Ver SPEC §2 / F2 2.6.
 */
export async function requestPasswordReset(
  username: string,
): Promise<RequestResetResult> {
  if (!isValidUsername(username)) {
    return { ok: false, error: "Usuario inválido." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: usernameToEmail(username),
  });

  // Cuenta inexistente u otro error → mismo mensaje genérico (no filtramos nada).
  if (error || !data?.properties?.hashed_token) {
    return { ok: true, error: GENERIC_OK };
  }

  const recoveryEmail = data.user?.user_metadata?.recovery_email;
  if (typeof recoveryEmail !== "string" || !recoveryEmail) {
    return { ok: true, error: GENERIC_OK };
  }

  const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=recovery&next=${encodeURIComponent("/auth/reset")}`;

  await sendEmail({
    to: recoveryEmail,
    subject: "Restablecé tu contraseña — Tanda",
    html: `
      <div style="font-family:system-ui,sans-serif;line-height:1.6;color:#1a130f">
        <h2 style="color:#a84510">Restablecer contraseña</h2>
        <p>Pediste restablecer la contraseña de tu cuenta de Tanda.</p>
        <p>
          <a href="${link}" style="display:inline-block;background:#ff7b3d;color:#fff;
             padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Elegir nueva contraseña
          </a>
        </p>
        <p style="color:#6b5d52;font-size:14px">
          Si no fuiste vos, ignorá este mail. El link vence en una hora.
        </p>
      </div>`,
  });

  return { ok: true, error: GENERIC_OK };
}
