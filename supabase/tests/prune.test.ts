// Feedback 4 · A3 — poda de invitados inactivos (14 días) y retención de tablas operativas.
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { closePool, createUser, withRollback } from "./_db";

afterAll(closePool);

async function makeGuest(c: PoolClient, name: string, daysAgo: number): Promise<string> {
  const id = await createUser(c, name);
  await c.query(
    `update auth.users set is_anonymous = true, email = null,
        created_at = now() - make_interval(days => $2), last_sign_in_at = now() - make_interval(days => $2)
      where id = $1`,
    [id, daysAgo],
  );
  return id;
}

async function exists(c: PoolClient, id: string): Promise<boolean> {
  const { rows } = await c.query("select 1 from auth.users where id = $1", [id]);
  return rows.length > 0;
}

describe("prune_inactive_guests", () => {
  it("borra invitados inactivos >14 días y respeta registrados, recientes, QA y en cola", async () => {
    await withRollback(async (c) => {
      const old = await makeGuest(c, "g_old", 20);
      const recent = await makeGuest(c, "g_recent", 3);
      const qa = await makeGuest(c, "g_qa", 40);
      await c.query("update public.profiles set qa_keep = true where id = $1", [qa]);
      const queued = await makeGuest(c, "g_queued", 30);
      await c.query(
        "insert into public.ranked_queue (user_id, rating, enqueued_at, last_seen) values ($1, 1500, now(), now())",
        [queued],
      );
      const registered = await createUser(c, "r_old");
      await c.query("update auth.users set created_at = now() - interval '90 days' where id = $1", [registered]);

      const { rows } = await c.query<{ n: number }>("select public.prune_inactive_guests() n");
      expect(rows[0]!.n).toBeGreaterThanOrEqual(1);

      expect(await exists(c, old)).toBe(false);
      expect(await exists(c, recent)).toBe(true);
      expect(await exists(c, qa)).toBe(true);
      expect(await exists(c, queued)).toBe(true);
      expect(await exists(c, registered)).toBe(true);

      const ev = await c.query("select 1 from public.ops_events where kind = 'guests_pruned'");
      expect(ev.rows.length).toBe(1);
    });
  });

  it("es invocable solo por el server (no por anon/authenticated)", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ anon: boolean; auth: boolean }>(
        `select has_function_privilege('anon', 'public.prune_inactive_guests(int)', 'execute') anon,
                has_function_privilege('authenticated', 'public.prune_inactive_guests(int)', 'execute') auth`,
      );
      expect(rows[0]).toEqual({ anon: false, auth: false });
    });
  });
});

describe("prune_ops_tables", () => {
  it("poda rate_limits viejos y ops_events >30 días", async () => {
    await withRollback(async (c) => {
      const u = await createUser(c, "rl_user");
      await c.query(
        "insert into public.rate_limits (user_id, action, window_start, count) values ($1, 'x_old', now() - interval '3 days', 1), ($1, 'x_new', now(), 1)",
        [u],
      );
      await c.query(
        "insert into public.ops_events (kind, created_at) values ('t_old', now() - interval '31 days'), ('t_new', now())",
      );
      await c.query("select public.prune_ops_tables()");
      const rl = await c.query<{ action: string }>("select action from public.rate_limits where user_id = $1", [u]);
      expect(rl.rows.map((r) => r.action)).toEqual(["x_new"]);
      const ev = await c.query<{ kind: string }>("select kind from public.ops_events where kind like 't\\_%'");
      expect(ev.rows.map((r) => r.kind)).toEqual(["t_new"]);
    });
  });
});
