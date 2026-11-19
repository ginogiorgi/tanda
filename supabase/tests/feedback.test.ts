/**
 * Reportes de bug/mejora (feedback 3 #17): `submit_feedback` guarda y limita (5/h y 20/día por usuario y
 * por IP); la tabla es interna (el cliente no la toca ni puede llamar la RPC).
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";

afterAll(closePool);

const ip = () => `ip_${randomUUID().replace(/-/g, "")}`;

async function submit(c: PoolClient, user: string | null, ipHash: string, msg = "se rompió algo"): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "select public.submit_feedback($1, $2, 'bug', $3, '/jugar', '{}'::jsonb, $4) as id",
    [user, user ? "pepe" : null, msg, ipHash],
  );
  return rows[0]!.id;
}

async function rejects(c: PoolClient, fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint s");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint s");
}

describe("submit_feedback", () => {
  it("guarda el reporte con sus datos (service role)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `fb_${randomUUID().slice(0, 6)}`);
      const h = ip();
      await asRole(c, "service_role");
      const id = await submit(c, u, h, "No carga la sala");
      await resetRole(c);
      const { rows } = await c.query("select user_id, kind, message, route, ip_hash, emailed from public.feedback_reports where id = $1", [id]);
      expect(rows[0]).toEqual({ user_id: u, kind: "bug", message: "No carga la sala", route: "/jugar", ip_hash: h, emailed: false });
    });
  });

  it("5 por hora por IP (sin sesión) → el 6º es rate_limited; otra IP sigue", async () => {
    await withRollback(async (c) => {
      const h = ip();
      for (let i = 0; i < 5; i++) await submit(c, null, h);
      await rejects(c, () => submit(c, null, h), /rate_limited/);
      await expect(submit(c, null, ip())).resolves.toBeTruthy();
    });
  });

  it("5 por hora por usuario aunque cambie de IP", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `fb_${randomUUID().slice(0, 6)}`);
      for (let i = 0; i < 5; i++) await submit(c, u, ip());
      await rejects(c, () => submit(c, u, ip()), /rate_limited/);
    });
  });

  it("20 por día: lo de hace horas cuenta para el día, no para la hora", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `fb_${randomUUID().slice(0, 6)}`);
      const h = ip();
      await c.query(
        `insert into public.feedback_reports (user_id, kind, message, ip_hash, created_at)
         select $1, 'idea', 'vieja', $2, now() - make_interval(hours => 2) from generate_series(1, 19)`,
        [u, h],
      );
      await expect(submit(c, u, h)).resolves.toBeTruthy(); // 20º del día, 1º de la hora
      await rejects(c, () => submit(c, u, ip()), /rate_limited/); // 21º del día (usuario)
      await rejects(c, () => submit(c, null, h), /rate_limited/); // 21º del día (IP)
      // Lo de hace más de un día no cuenta.
      await c.query("update public.feedback_reports set created_at = now() - make_interval(days => 2) where ip_hash = $1", [h]);
      await expect(submit(c, u, h)).resolves.toBeTruthy();
    });
  });

  it("valida tipo y largo en la tabla", async () => {
    await withRollback(async (c) => {
      await rejects(
        c,
        () => c.query("select public.submit_feedback(null, null, 'otro', 'hola', null, '{}', $1)", [ip()]),
        /check constraint/,
      );
      await rejects(c, () => submit(c, null, ip(), "x".repeat(1001)), /check constraint/);
    });
  });

  it("el cliente no toca la tabla ni puede llamar la RPC", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `fb_${randomUUID().slice(0, 6)}`);
      for (const role of ["anon", "authenticated"] as const) {
        await asRole(c, role, u);
        await rejects(c, () => c.query("select * from public.feedback_reports"), /permission denied/);
        await rejects(c, () => submit(c, u, ip()), /permission denied/);
        await resetRole(c);
      }
    });
  });

  it("borrar la cuenta conserva el reporte (user_id → null)", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `fb_${randomUUID().slice(0, 6)}`);
      const id = await submit(c, u, ip());
      await c.query("delete from auth.users where id = $1", [u]);
      const { rows } = await c.query("select user_id from public.feedback_reports where id = $1", [id]);
      expect(rows).toEqual([{ user_id: null }]);
    });
  });
});
