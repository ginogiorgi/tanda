import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-16">
      <Link href="/" aria-label="Tanda — inicio">
        <Wordmark className="text-6xl" />
      </Link>
      <div className="w-full max-w-sm rounded-[6px] border-2 border-ink bg-bg-elevated p-6 shadow-pop sm:p-8">
        {children}
      </div>
    </main>
  );
}
