/**
 * Tarea 6 — silenciar el warning `THREE.Clock: This module has been deprecated. Please use
 * THREE.Timer instead.`
 *
 * Lo emite el CONSTRUCTOR de `THREE.Clock` (three r183+), y `@react-three/fiber` (v9) instancia un
 * `new THREE.Clock()` internamente en el store de cada `<Canvas>` — no es nuestro código (no creamos
 * Clock) y R3F no expone una API para inyectar el reloj. Hasta que R3F migre a `THREE.Timer`,
 * filtramos EXACTAMENTE ese mensaje y dejamos pasar todo lo demás. Se aplica una sola vez.
 */
let patched = false;

export function suppressThreeClockDeprecation(): void {
  if (patched || typeof console === "undefined" || typeof console.warn !== "function") return;
  patched = true;
  const original = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Clock: This module has been deprecated")) {
      return;
    }
    original(...(args as Parameters<typeof console.warn>));
  };
}
