import Link from "next/link";
import { GuestNameForm } from "@/components/lobby/GuestNameForm";

export default function InvitadoPage() {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="text-sm font-medium uppercase tracking-[0.3em] text-fg-subtle">
          Modo práctica
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-gold sm:text-4xl">
          Jugá como invitado
        </h1>
        <p className="max-w-md text-balance text-fg-muted">
          Un torneo de práctica vs. la máquina, sin cuenta. No se guarda nada:
          creá una cuenta cuando quieras tu avatar y tu historial.
        </p>
      </div>

      <GuestNameForm />

      <Link
        href="/"
        className="text-sm text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
      >
        Volver
      </Link>
    </main>
  );
}
