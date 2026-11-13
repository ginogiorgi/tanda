/**
 * Pantalla de revelación de selección (B2.3, ~2s): "te tocó esta nación", con su kit (banda
 * diagonal cruzada, espejo de la remera 3D) y nombre. Se muestra una sola vez al entrar al torneo,
 * antes del bracket, mientras corre la ventana de presentación (begin_presentation, B2.1). CSS puro
 * (`.reveal-pop`); `prefers-reduced-motion` la neutraliza globalmente (globals.css).
 *
 * Datos ya disponibles vía `get_bracket` (mi `BracketTeam`): nombre, código y colores de kit. La
 * bandera real se cablea en B5.
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
        <div className="relative h-28 w-28">
          <div
            className="h-full w-full rounded-3xl border border-white/10 shadow-pop"
            style={kitSwatchStyle(me)}
            aria-hidden
          />
          {/* Bandera real montada sobre el kit (B5.1). */}
          <TeamMark
            flag={me.flag}
            crest={me.crest}
            name={me.team_name}
            className="absolute -bottom-2 -right-2 h-10 rounded-md shadow-md ring-1 ring-black/40"
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-4xl font-bold uppercase tracking-tight text-fg">
            {me.team_name ?? "Tu selección"}
          </span>
          {me.team_code && (
            <span className="font-mono text-sm uppercase tracking-[0.3em] text-gold">
              {me.team_code}
            </span>
          )}
        </div>
      </div>

      <span className="text-xs text-fg-subtle">Defendé sus colores en la tanda</span>
    </div>
  );
}
