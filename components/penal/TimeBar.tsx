/**
 * Barra de tiempo del penal (8.3): se vacía contra el `deadline` del server (PenalLive ya corrige
 * el reloj con el offset, SPEC §1.3/§4.6b). Barra de imprenta (marco de tinta): tinta → naranja →
 * roja a medida que baja; en los últimos 3s pulsa en rojo (acompaña la vibración del dispositivo). Presentacional: recibe la fracción.
 */

interface TimeBarProps {
  /** Fracción restante 0..1 (remaining / total de la fase). */
  fraction: number;
}

export function TimeBar({ fraction }: TimeBarProps) {
  const f = Math.max(0, Math.min(1, fraction));
  const urgent = f <= 0.3; // ~últimos 3s en la fase de 10s
  const color = urgent ? "bg-danger" : f <= 0.6 ? "bg-accent-orange" : "bg-ink";

  return (
    <div
      className="h-3 w-full overflow-hidden border-2 border-ink bg-bg-raised"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(f * 100)}
    >
      <div
        className={`h-full transition-[width] duration-200 ease-linear ${color} ${
          urgent ? "motion-safe:animate-pulse" : ""
        }`}
        style={{ width: `${f * 100}%` }}
      />
    </div>
  );
}
