/**
 * Telemetría propia (feedback 4 F): `log_client_event` (cliente con sesión, rate limit, tabla interna),
 * `submit_auto_report` (una fila por fingerprint, mail como mucho 1 cada 24 h, tope por IP) y el aviso
 * del watchdog (`ops_notify_poke` no hace nada sin URL en Vault).
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";

afterAll(closePool);

const fp = () => randomBytes(16).toString("hex");
const ip = () => `ip_${randomUUID().replace(/-/g, "")}`;

async function rejects(c: PoolClient, fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint s");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint s");
}

type Auto = { id: string; notify: boolean; occurrences: number };
async function auto(c: PoolClient, fingerprint: string, ipHash: string): Promise<Auto> {
  const { rows } = await c.query<Auto>(
    "select * from public.submit_auto_report($1, null, 'TypeError: x is undefined', '/partido', '{}'::jsonb, $2)",
    [fingerprint, ipHash],
  );
  return rows[0]!;
}

describe("log_client_event", () => {
  it("guarda el evento del usuario con sesión; el cliente no lee la tabla", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `te_${randomUUID().slice(0, 6)}`);
      await asRole(c, "authenticated", u);
      await c.query("select public.log_client_event('rpc_error:resolve_penalty', '/partido', '{\"code\":\"500\"}'::jsonb)");
      await rejects(c, () => c.query("select * from public.client_events"), /permission denied/);
      await resetRole(c);
      const { rows } = await c.query("select user_id, kind, route, detail from public.client_events where user_id = $1", [u]);
      expect(rows).toEqual([{ user_id: u, kind: "rpc_error:resolve_penalty", route: "/partido", detail: { code: "500" } }]);
    });
  });

  it("sin sesión no entra; anon no la ejecuta", async () => {
    await withRollback(async (c) => {
      await asRole(c, "authenticated");
      await rejects(c, () => c.query("select public.log_client_event('x_y_z', null, '{}')"), /unauthenticated/);
      await resetRole(c);
      await asRole(c, "anon");
      await rejects(c, () => c.query("select public.log_client_event('x_y_z', null, '{}')"), /permission denied/);
    });
  });

  it("valida el tipo y el tamaño, y limita a 30 cada 10 min", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `te_${randomUUID().slice(0, 6)}`);
      await asRole(c, "authenticated", u);
      await rejects(c, () => c.query("select public.log_client_event('Mal Tipo', null, '{}')"), /bad_kind/);
      await rejects(
        c,
        () => c.query("select public.log_client_event('big_one', null, jsonb_build_object('s', repeat('x', 5000)))"),
        /too_long/,
      );
      for (let i = 0; i < 30; i++) await c.query("select public.log_client_event('spam_event', null, '{}')");
      await rejects(c, () => c.query("select public.log_client_event('spam_event', null, '{}')"), /rate_limited/);
    });
  });
});

describe("submit_auto_report", () => {
  it("el mismo fingerprint suma ocurrencias y avisa una sola vez cada 24 h", async () => {
    await withRollback(async (c) => {
      const f = fp();
      const first = await auto(c, f, ip());
      expect(first).toMatchObject({ notify: true, occurrences: 1 });
      await c.query("update public.feedback_reports set emailed_at = now(), emailed = true where id = $1", [first.id]);
      for (let i = 2; i <= 5; i++) {
        const again = await auto(c, f, ip());
        expect(again).toEqual({ id: first.id, notify: false, occurrences: i });
      }
      await c.query("update public.feedback_reports set emailed_at = now() - make_interval(hours => 25) where id = $1", [first.id]);
      expect((await auto(c, f, ip())).notify).toBe(true);
      // Si el mail anterior no salió (emailed_at null), el próximo vuelve a intentar.
      const g = fp();
      await auto(c, g, ip());
      expect((await auto(c, g, ip())).notify).toBe(true);
    });
  });

  it("tope de 10 fingerprints nuevos por hora por IP; repetir uno existente no cuenta", async () => {
    await withRollback(async (c) => {
      const h = ip();
      const prints = Array.from({ length: 10 }, fp);
      for (const f of prints) await auto(c, f, h);
      await rejects(c, () => auto(c, fp(), h), /rate_limited/);
      await expect(auto(c, prints[0]!, h)).resolves.toMatchObject({ occurrences: 2 });
    });
  });

  it("los automáticos no gastan el cupo de los reportes manuales", async () => {
    await withRollback(async (c) => {
      const h = ip();
      for (let i = 0; i < 8; i++) await auto(c, fp(), h);
      for (let i = 0; i < 5; i++) {
        await c.query("select public.submit_feedback(null, null, 'bug', 'algo anda mal', null, '{}', $1)", [h]);
      }
      await rejects(
        c,
        () => c.query("select public.submit_feedback(null, null, 'bug', 'algo anda mal', null, '{}', $1)", [h]),
        /rate_limited/,
      );
    });
  });

  it("el cliente no la puede llamar", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, `te_${randomUUID().slice(0, 6)}`);
      await asRole(c, "authenticated", u);
      await rejects(c, () => auto(c, fp(), ip()), /permission denied/);
    });
  });
});

describe("aviso del watchdog", () => {
  it("sin URL en Vault, ops_notify_poke no manda nada aunque haya pendientes", async () => {
    await withRollback(async (c) => {
      await c.query("insert into public.ops_events (kind, detail) values ('round_stall_healed', '{}')");
      const before = await c.query<{ n: string }>("select count(*)::text as n from net.http_request_queue");
      await c.query("select public.ops_notify_poke()");
      const after = await c.query<{ n: string }>("select count(*)::text as n from net.http_request_queue");
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    });
  });

  it("con URL y pendientes encola un solo POST; sin pendientes, ninguno", async () => {
    await withRollback(async (c) => {
      await c.query("select vault.create_secret('http://127.0.0.1:9/api/ops/notify', 'ops_notify_url')");
      const count = async () =>
        Number((await c.query<{ n: string }>("select count(*)::text as n from net.http_request_queue")).rows[0]!.n);
      await c.query("update public.ops_events set notified_at = now() where notified_at is null");
      const base = await count();
      await c.query("select public.ops_notify_poke()");
      expect(await count()).toBe(base);
      await c.query("insert into public.ops_events (kind, detail) values ('guests_pruned', '{}')");
      await c.query("select public.ops_notify_poke()");
      expect(await count()).toBe(base); // no es de los que avisan
      await c.query("insert into public.ops_events (kind, detail) values ('tick_error', '{}')");
      await c.query("select public.ops_notify_poke()");
      expect(await count()).toBe(base + 1);
    });
  });
});
