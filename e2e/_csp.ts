import { expect, test as base, type BrowserContext } from "@playwright/test";

/**
 * La CSP va ENFORCED (next.config.ts): una violación = algo roto en el navegador del usuario (un fetch,
 * una textura, el wasm de los GLB…). Todo test que importe `test` de acá falla si alguna página de su
 * contexto dispara `securitypolicyviolation`. Contextos creados a mano (ranked): `watchCsp(ctx, csp)`.
 */
export async function watchCsp(context: BrowserContext, sink: string[]): Promise<void> {
  await context.exposeBinding("__cspViolation", ({ page }, v: string) => {
    sink.push(`${page.url()} → ${v}`);
  });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const report = (window as unknown as { __cspViolation?: (v: string) => void }).__cspViolation;
      report?.(`${e.disposition} ${e.effectiveDirective} ${e.blockedURI || "inline"}`);
    });
  });
}

export const test = base.extend<{ csp: string[] }>({
  csp: [
    async ({}, provide) => {
      const violations: string[] = [];
      await provide(violations);
      expect(violations, "violaciones de CSP").toEqual([]);
    },
    { auto: true },
  ],
  context: async ({ context, csp }, provide) => {
    await watchCsp(context, csp);
    await provide(context);
  },
});

export { expect };
