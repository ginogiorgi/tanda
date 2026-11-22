import { AuthShell } from "@/components/auth/AuthShell";
import { Footer } from "@/components/ui/Footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex w-full flex-1 flex-col">
        <AuthShell>{children}</AuthShell>
      </div>
      <Footer />
    </>
  );
}
