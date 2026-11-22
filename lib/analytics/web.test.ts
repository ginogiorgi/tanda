import { describe, expect, it } from "vitest";
import { WEB_ANALYTICS_INIT } from "./web";

type Ev = { type: string; url: string };
function beforeSend(): (e: Ev) => Ev {
  const w: { va?: (...a: unknown[]) => void; vaq?: unknown[][] } = {};
  new Function("window", WEB_ANALYTICS_INIT)(w);
  const call = w.vaq?.find((c) => c[0] === "beforeSend");
  return call?.[1] as (e: Ev) => Ev;
}

describe("snippet de Web Analytics", () => {
  const send = beforeSend();
  const url = (u: string) => send({ type: "pageview", url: u }).url;

  it("deja el beforeSend en la cola antes de que cargue el script", () => {
    expect(typeof send).toBe("function");
  });
  it("saca query y hash (pueden traer tokens)", () => {
    expect(url("https://tanda2026.com.ar/auth/reset?token_hash=abc#x")).toBe("https://tanda2026.com.ar/auth/reset");
  });
  it("todas las salas cuentan como una sola pantalla", () => {
    expect(url("https://tanda2026.com.ar/sala/AB12C")).toBe("https://tanda2026.com.ar/sala/:code");
  });
  it("el resto queda igual", () => {
    expect(url("https://tanda2026.com.ar/ranking")).toBe("https://tanda2026.com.ar/ranking");
  });
});
