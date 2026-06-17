// 9.5 — rate-limit anti-flood de las RPC abusables. Verifica el helper (ventana fija que tira
// `rate_limited` al superar el máximo), que el cliente no puede escribir el contador ni ejecutar el
// helper, y el wiring real en quick_play (el 21º llamado del mismo usuario en un minuto se corta).
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closePool, withRollback, asRole, createUser } from "./_db";

afterAll(closePool);

describe("enforce_rate_limit (helper)", () => {
  it("tira rate_limited al superar el máximo dentro de la ventana", async () => {
    await withRollback(async (c) => {
      const uid = randomUUID();
      // El helper lee auth.uid() = request.jwt.claim.sub; lo seteamos en la conexión owner.
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      // max=2 → 1ª y 2ª pasan, 3ª corta.
      await c.query("select public.enforce_rate_limit('test', 2, interval '1 minute')");
      await c.query("select public.enforce_rate_limit('test', 2, interval '1 minute')");
      await expect(
        c.query("select public.enforce_rate_limit('test', 2, interval '1 minute')"),
      ).rejects.toThrow(/rate_limited/);
    });
  });

  // Nota: el reinicio de ventana usa now() (tiempo de transacción), que es CONSTANTE dentro de una
  // transacción → no se puede ejercitar bajo withRollback (los llamados reales son transacciones
  // separadas, donde now() avanza). El reinicio queda verificado por inspección del CASE en la migración.
});

describe("rate_limits / enforce_rate_limit: sin acceso del cliente", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} NO puede escribir rate_limits directo`, async () => {
      await withRollback(async (c) => {
        await asRole(c, role, randomUUID());
        await expect(
          c.query(
            "insert into public.rate_limits (user_id, action) values ($1, 'x')",
            [randomUUID()],
          ),
        ).rejects.toThrow();
      });
    });

    it(`${role} NO puede ejecutar enforce_rate_limit()`, async () => {
      await withRollback(async (c) => {
        await asRole(c, role, randomUUID());
        await expect(
          c.query("select public.enforce_rate_limit('x', 1, interval '1 minute')"),
        ).rejects.toThrow(/permission denied/i);
      });
    });
  }
});

describe("wiring: quick_play está rate-limiteado", () => {
  it("el 21º quick_play del mismo usuario en un minuto se corta con rate_limited", async () => {
    await withRollback(async (c) => {
      const uid = await createUser(c, `rl_${Date.now()}`);
      await asRole(c, "authenticated", uid);
      // Los primeros 20 pasan (reanudan/crean sala); el 21º supera el límite.
      for (let i = 0; i < 20; i++) {
        await c.query("select public.quick_play()");
      }
      // El 21º aborta la transacción al tirar rate_limited; withRollback limpia (no llamamos más).
      await expect(c.query("select public.quick_play()")).rejects.toThrow(/rate_limited/);
    });
  });
});
