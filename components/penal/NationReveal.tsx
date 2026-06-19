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
import type { BracketTeam } from "@/lib/bracket/bracket";

export function NationReveal({ me }: { me: BracketTeam }) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
        Te tocó
      </span>

      <div className="reveal-pop flex flex-col items-center gap-5">
        <div
          className="h-24 w-24 rounded-2xl border border-border shadow-lg"
          style={kitSwatchStyle(me)}
          aria-hidden
        />
        <div className="flex flex-col items-center gap-1">
          <span className="text-3xl font-extrabold tracking-tight text-fg">
            {me.nation_name ?? "Tu selección"}
          </span>
          {me.nation_code && (
            <span className="font-mono text-sm uppercase tracking-[0.3em] text-gold">
              {me.nation_code}
            </span>
          )}
        </div>
      </div>

      <span className="text-xs text-fg-subtle">Defendé sus colores en la tanda</span>
    </div>
  );
}
