import { useEffect } from "react";

interface NetworkInformationLike {
  saveData?: boolean;
}

function saveData(): boolean {
  const conn: unknown = Reflect.get(navigator, "connection");
  return typeof conn === "object" && conn !== null && (conn as NetworkInformationLike).saveData === true;
}

/**
 * Precarga del 3D del penal (F4): mientras esperás en la sala, la cola o la presentación, baja en
 * segundo plano el chunk de la escena (three + R3F) y los GLB de los personajes (~1,4 MB). Así el primer
 * penal no paga la descarga. Corre en un momento ocioso, una sola vez por pantalla, y se saltea con
 * "ahorro de datos" del navegador (la escena se baja igual al abrir el penal).
 */
export function usePreload3D(): void {
  useEffect(() => {
    if (saveData()) return;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      void import("./PenalScene");
      void import("@/components/avatar/glbLoad").then((m) => m.preloadGlbBodies());
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => {
        done = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = window.setTimeout(run, 800);
    return () => {
      done = true;
      window.clearTimeout(id);
    };
  }, []);
}
