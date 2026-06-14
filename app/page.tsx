const ACCENTS = [
  "bg-accent-blue",
  "bg-accent-green",
  "bg-accent-red",
  "bg-accent-magenta",
  "bg-accent-orange",
  "bg-accent-teal",
] as const;

export default function Home() {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
          Mundial · Trivia · Tiempo real
        </span>
        <h1 className="text-6xl font-extrabold tracking-tight text-gold sm:text-8xl">
          TANDA
        </h1>
        <p className="max-w-md text-balance text-base text-fg-muted sm:text-lg">
          Cada pregunta es un penal. Respondé bien y más rápido que tu rival para
          meter el gol o atajar. 48 selecciones, una sola copa.
        </p>
      </div>

      <div className="flex items-center gap-2" aria-hidden>
        {ACCENTS.map((accent) => (
          <span key={accent} className={`h-2.5 w-2.5 rounded-full ${accent}`} />
        ))}
      </div>

      <p className="text-xs uppercase tracking-widest text-fg-subtle">
        Scaffold F1 · en construcción
      </p>
    </main>
  );
}
