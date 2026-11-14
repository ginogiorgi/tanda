"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Navegación de la app — la ÚNICA envoltura del router (regla de lint: `useRouter` de
 * `next/navigation` está prohibido fuera de `lib/nav`).
 *
 * Por qué: el delay que vio Gino venía en parte de `await rpc(); router.push()` sin estado intermedio
 * — el botón no reaccionaba hasta que el server respondía Y la página nueva renderizaba. Acá:
 *  · `push`/`replace` corren dentro de `startTransition` → `pending` queda en true hasta que la pantalla
 *    nueva pinta (los botones lo muestran), y el `loading.tsx` del grupo aparece al instante.
 *  · `leave(href, cleanup)`: para salidas cuyo RPC es descartable (cancelar cola, salir de sala,
 *    cerrar sesión) se navega YA y el RPC corre en paralelo; el server limpia igual por su cuenta.
 */
export function useNav() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const push = useCallback(
    (href: string, opts?: { refresh?: boolean }) =>
      startTransition(() => {
        router.push(href);
        if (opts?.refresh) router.refresh();
      }),
    [router],
  );

  const replace = useCallback(
    (href: string) => startTransition(() => router.replace(href)),
    [router],
  );

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const leave = useCallback(
    (href: string, cleanup: () => PromiseLike<unknown>, opts?: { refresh?: boolean }) => {
      void Promise.resolve(cleanup()).then(
        () => {
          // Una vez limpio el server, la pantalla destino puede haber cambiado (p. ej. "Volver al partido").
          if (opts?.refresh) router.refresh();
        },
        () => undefined,
      );
      startTransition(() => router.push(href));
    },
    [router],
  );

  // Objeto estable (salvo `pending`) → se puede usar en arrays de dependencias.
  return useMemo(() => ({ push, replace, refresh, leave, pending }), [push, replace, refresh, leave, pending]);
}
