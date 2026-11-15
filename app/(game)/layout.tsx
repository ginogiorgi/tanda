/**
 * Layout de JUEGO (sala, cola ranked, partido). Feedback 2 (P4): la pantalla de juego es un
 * `GameStage` de un viewport (escena, tarjeta y HUD `absolute` adentro) y debajo, en el flujo, el
 * footer. Nada `fixed`, nada de paneles con scroll propio: si una vista es más alta (bracket), scrollea
 * el documento.
 */
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex w-full flex-1 flex-col pb-[env(safe-area-inset-bottom)]">{children}</main>;
}
