/**
 * Pantalla de revelación del equipo (~2s): "te tocó este equipo". Selecciones: swatch del kit con
 * la bandera montada. Clubes: el escudo original grande sobre un halo con los colores del kit. Se muestra una sola vez al entrar al torneo,
 * antes del bracket, mientras corre la ventana de presentación (begin_presentation, B2.1). CSS puro
 * (`.reveal-pop`); `prefers-reduced-motion` la neutraliza globalmente (globals.css).
 *
 * Datos vía `get_bracket` (mi `BracketTeam`): nombre, código, colores de kit, bandera/escudo.
 */

import { kitSwatchStyle } from "@/lib/realtime/score";
import { TeamMark } from "@/components/common/TeamMark";
import { Eyebrow } from "@/components/ui/Typography";
import type { BracketTeam } from "@/lib/bracket/bracket";

export function TeamReveal({ me }: { me: BracketTeam }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-7 text-center">
      <Eyebrow className="tracking-[0.35em]">Te tocó</Eyebrow>

      <div className="reveal-pop flex flex-col items-center gap-6">
        {me.crest && !me.flag ? (
          // Clubes: el escudo propio ES la identidad → protagonista, con el kit como halo detrás.
          <div className="relative flex h-32 w-32 items-center justify-center">
            <div
              className="absolute inset-3 rounded-full opacity-40 blur-2xl"
              style={kitSwatchStyle(me)}
              aria-hidden
            />
            <TeamMark
              flag={null}
              crest={me.crest}
              name={me.team_name}
              className="relative h-32 drop-shadow-[4px_4px_0_var(--ink)]"
            />
          </div>
        ) : (
          <div className="relative h-28 w-28">
            <div
              className="h-full w-full rounded-[6px] border-2 border-ink shadow-pop"
              style={kitSwatchStyle(me)}
              aria-hidden
            />
            {/* Bandera real montada sobre el kit. */}
            <TeamMark
              flag={me.flag}
              name={me.team_name}
              className="absolute -bottom-2 -right-2 h-10 rounded-[3px] border-2 border-ink shadow-card"
            />
          </div>
        )}
        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-4xl font-extrabold uppercase tracking-tight text-fg">
            {me.team_name ?? "Tu equipo"}
          </span>
          {me.team_code && (
            <span className="font-mono text-sm uppercase tracking-[0.3em] text-brand">
              {me.team_code}
            </span>
          )}
        </div>
      </div>

      <span className="text-xs text-fg-subtle">Defendé sus colores en la tanda</span>
    </div>
  );
}
