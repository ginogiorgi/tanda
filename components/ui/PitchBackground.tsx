/**
 * Fondo ambiental de cancha vista desde arriba con un penal en loop (T9). CSS liviano y sin JS: la
 * cancha es un SVG estático (líneas, círculo central, áreas, arcos, arcos de gol) y solo la pelota y
 * el arquero se animan por keyframes (`tanda-bg-*` en globals.css). Va `fixed inset-0 -z-10` con blur
 * fuerte + opacidad baja para que los menús se lean bien; durante el penal la escena 3D (canvas opaco)
 * lo tapa, así que no compite con su FPS. `prefers-reduced-motion` lo deja estático (lo cubre el
 * bloque global del selector `*`). Presentacional, sin interactividad → Server Component.
 */
export function PitchBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[100svh] overflow-hidden"
    >
      <svg
        className="h-full w-full opacity-[0.17] blur-[4px]"
        viewBox="0 0 400 600"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        stroke="#d4af37"
        strokeWidth={1.6}
        strokeLinecap="round"
      >
        {/* Límites + línea media + círculo central */}
        <rect x={12} y={12} width={376} height={576} rx={4} />
        <path d="M12 300 H388" />
        <circle cx={200} cy={300} r={52} />
        <circle cx={200} cy={300} r={2.5} fill="#d4af37" stroke="none" />

        {/* Área de arriba */}
        <rect x={88} y={12} width={224} height={84} />
        <rect x={146} y={12} width={108} height={32} />
        <circle cx={200} cy={70} r={2.5} fill="#d4af37" stroke="none" />
        <path d="M155 96 A 52 52 0 0 1 245 96" />
        <path d="M170 9 H230" strokeWidth={3} />

        {/* Área de abajo (donde corre el penal animado) */}
        <rect x={88} y={504} width={224} height={84} />
        <rect x={146} y={556} width={108} height={32} />
        <circle cx={200} cy={530} r={2.5} fill="#d4af37" stroke="none" />
        <path d="M155 504 A 52 52 0 0 0 245 504" />
        <path d="M170 591 H230" strokeWidth={3} />

        {/* Arquero en la línea de gol + pelota pateada desde el punto del penal */}
        <rect className="tanda-bg-keeper" x={185} y={584} width={30} height={6} rx={3} fill="#d4af37" stroke="none" />
        <circle className="tanda-bg-ball" cx={200} cy={530} r={5} fill="#d4af37" stroke="none" />
      </svg>
    </div>
  );
}
