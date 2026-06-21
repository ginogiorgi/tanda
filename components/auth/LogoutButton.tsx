"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/Button";

// `size`/`className` quedan parametrizables: en el home la fila de CTAs lo quiere grande y del
// mismo ancho que "Mi perfil" (T6); en la nav del perfil sigue chico (default).
export function LogoutButton({
  size = "sm",
  className,
}: {
  size?: ButtonProps["size"];
  className?: string;
}) {
  const router = useRouter();

  async function onClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button onClick={onClick} variant="outline" size={size} className={className}>
      Cerrar sesión
    </Button>
  );
}
