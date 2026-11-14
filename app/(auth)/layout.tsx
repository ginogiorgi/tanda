import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { Footer } from "@/components/ui/Footer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
      <ScreenHeader hideTitle className="border-b-0 bg-transparent" />
      <div className="my-auto flex w-full flex-col items-center gap-8 px-6 py-16">
        <Link href="/" aria-label="Tanda — inicio">
          <Wordmark className="text-6xl" stamp={false} />
        </Link>
        <div className="w-full max-w-sm rounded-[6px] border-2 border-ink bg-bg-elevated p-6 shadow-pop sm:p-8">
          {children}
        </div>
      </div>
      <Footer />
    </main>
  );
}
