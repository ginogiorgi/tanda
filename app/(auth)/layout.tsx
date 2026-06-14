import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-6 py-16">
      <Link href="/" className="text-4xl font-extrabold tracking-tight text-gold">
        TANDA
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-elevated/40 p-6 sm:p-8">
        {children}
      </div>
    </main>
  );
}
