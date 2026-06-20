import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-pitch flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-16">
      <Link
        href="/"
        className="font-display text-5xl font-bold uppercase tracking-tight text-gold drop-shadow-[0_6px_24px_rgba(212,175,55,0.18)]"
      >
        TANDA
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-bg-elevated/60 p-6 shadow-card backdrop-blur-md sm:p-8">
        {children}
      </div>
    </main>
  );
}
