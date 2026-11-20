/**
 * Ranking de hinchas (feedback 3 #15): favoritos en el perfil, contador agregado por trigger, RPCs y la
 * prioridad de favorito al repartir equipos en `start_tournament`.
 */
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";
import { enableArgMode } from "./_fixtures";

afterAll(closePool);

const name = (p: string) => `${p}_${randomUUID().slice(0, 6)}`;

async function teamId(c: PoolClient, mode: string, code: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>("select id from public.teams where mode_id = $1 and code = $2", [mode, code]);
  return rows[0]!.id;
}
async function codes(c: PoolClient, mode: string, n: number): Promise<string[]> {
  const { rows } = await c.query<{ code: string }>("select code from public.teams where mode_id = $1 order by code limit $2", [mode, n]);
  return rows.map((r) => r.code);
}
async function fans(c: PoolClient, mode: string, code: string): Promise<number> {
  const { rows } = await c.query<{ fans: number }>(
    "select coalesce(fc.fans, 0) as fans from public.teams t left join public.fan_counts fc on fc.team_id = t.id where t.mode_id = $1 and t.code = $2",
    [mode, code],
  );
  return rows[0]!.fans;
}
/** Usuario registrado con favoritos por la metadata del alta (como el registro). */
async function fanUser(c: PoolClient, club: string | null, nation: string | null): Promise<string> {
  const uid = await createUser(c, name("fan"));
  // createUser no manda favoritos: se los pone el RPC como haría el cliente.
  if (club && nation) {
    await asRole(c, "authenticated", uid);
    await c.query("select public.set_favorites($1, $2)", [club, nation]);
    await resetRole(c);
  }
  return uid;
}
async function guest(c: PoolClient): Promise<string> {
  const g = await createUser(c, name("inv"));
  await c.query("update auth.users set is_anonymous = true where id = $1", [g]);
  return g;
}
async function rejects(c: PoolClient, fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  await c.query("savepoint s");
  await expect(fn()).rejects.toThrow(re);
  await c.query("rollback to savepoint s");
}

/** Sala real con estos humanos (el primero la crea), arrancada. Devuelve el equipo de cada humano. */
async function startWith(c: PoolClient, mode: "worldcup" | "arg", users: string[]): Promise<{ teams: (string | null)[]; all: string[] }> {
  await asRole(c, "authenticated", users[0]);
  const { rows } = await c.query<{ room_id: string; tournament_id: string; code: string }>("select * from public.create_room($1)", [mode]);
  const { room_id, tournament_id, code } = rows[0]!;
  await resetRole(c);
  for (const u of users.slice(1)) {
    await asRole(c, "authenticated", u);
    await c.query("select * from public.join_room($1)", [code]);
    await resetRole(c);
  }
  await c.query("select public.start_tournament($1)", [room_id]);
  const parts = await c.query<{ user_id: string | null; code: string }>(
    "select p.user_id, t.code from public.participants p join public.teams t on t.id = p.team_id where p.tournament_id = $1",
    [tournament_id],
  );
  return {
    teams: users.map((u) => parts.rows.find((r) => r.user_id === u)?.code ?? null),
    all: parts.rows.map((r) => r.code),
  };
}

describe("favoritos y contador", () => {
  it("alta con favoritos (metadata del registro) suma al contador", async () => {
    await withRollback(async (c) => {
      const [club] = await codes(c, "arg", 1);
      const [nation] = await codes(c, "worldcup", 1);
      const before = [await fans(c, "arg", club!), await fans(c, "worldcup", nation!)];
      const { rows } = await c.query<{ id: string }>(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
           raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1,
           crypt('x', gen_salt('bf')), now(), now(), now(), '{}'::jsonb,
           jsonb_build_object('username', $2::text, 'fav_club', $3::text, 'fav_nation', $4::text), false, false)
         returning id`,
        [`${name("reg")}@users.tanda2026.com.ar`, name("reg"), club, nation],
      );
      const p = await c.query("select fav_club_id, fav_nation_id from public.profiles where id = $1", [rows[0]!.id]);
      expect(p.rows[0]).toEqual({ fav_club_id: await teamId(c, "arg", club!), fav_nation_id: await teamId(c, "worldcup", nation!) });
      expect([await fans(c, "arg", club!), await fans(c, "worldcup", nation!)]).toEqual([before[0]! + 1, before[1]! + 1]);
    });
  });

  it("cambios y bajas mantienen los contadores exactos", async () => {
    await withRollback(async (c) => {
      const [c1, c2] = await codes(c, "arg", 2);
      const [n1, n2] = await codes(c, "worldcup", 2);
      const base = { c1: await fans(c, "arg", c1!), c2: await fans(c, "arg", c2!), n1: await fans(c, "worldcup", n1!), n2: await fans(c, "worldcup", n2!) };
      const a = await fanUser(c, c1!, n1!);
      const b = await fanUser(c, c1!, n2!);
      expect(await fans(c, "arg", c1!)).toBe(base.c1 + 2);
      // a cambia de club; mismo país (no cuenta doble)
      await asRole(c, "authenticated", a);
      await c.query("select public.set_favorites($1, $2)", [c2, n1]);
      await c.query("select public.set_favorites($1, $2)", [c2, n1]);
      await resetRole(c);
      expect([await fans(c, "arg", c1!), await fans(c, "arg", c2!), await fans(c, "worldcup", n1!)]).toEqual([base.c1 + 1, base.c2 + 1, base.n1 + 1]);
      // baja (borrado de la cuenta → cascade del perfil)
      await c.query("delete from auth.users where id = $1", [b]);
      expect([await fans(c, "arg", c1!), await fans(c, "worldcup", n2!)]).toEqual([base.c1, base.n2]);
      // el contador coincide con un COUNT real
      const real = await c.query<{ n: number }>("select count(*)::int as n from public.profiles where fav_club_id = $1", [await teamId(c, "arg", c2!)]);
      expect(await fans(c, "arg", c2!)).toBe(real.rows[0]!.n);
    });
  });

  it("set_favorites: solo registrados y con códigos del modo correcto", async () => {
    await withRollback(async (c) => {
      const [club] = await codes(c, "arg", 1);
      const [nation] = await codes(c, "worldcup", 1);
      const g = await guest(c);
      await asRole(c, "authenticated", g);
      await rejects(c, () => c.query("select public.set_favorites($1, $2)", [club, nation]), /registered_only/);
      await resetRole(c);
      const u = await createUser(c, name("u"));
      await asRole(c, "authenticated", u);
      await rejects(c, () => c.query("select public.set_favorites($1, $2)", [nation, club]), /invalid_favorite/);
      // el cliente no escribe las columnas a mano (solo username/avatar)
      await rejects(c, () => c.query("update public.profiles set fav_club_id = null where id = $1", [u]), /permission denied/);
      await rejects(c, () => c.query("select * from public.fan_counts"), /permission denied/);
      await resetRole(c);
      // la FK compuesta no deja un club del modo equivocado
      await rejects(
        c,
        async () => c.query("update public.profiles set fav_club_id = $1 where id = $2", [await teamId(c, "worldcup", nation!), u]),
        /foreign key/,
      );
    });
  });

  it("get_fan_ranking: los dos rankings ordenados + tus favoritos (también sin sesión)", async () => {
    await withRollback(async (c) => {
      const [club] = await codes(c, "arg", 1);
      const [nation] = await codes(c, "worldcup", 1);
      const u = await fanUser(c, club!, nation!);
      await asRole(c, "authenticated", u);
      const { rows } = await c.query<{ r: { clubs: { code: string; fans: number }[]; nations: unknown[]; mine: unknown } }>(
        "select public.get_fan_ranking() as r",
      );
      const r = rows[0]!.r;
      expect(r.mine).toEqual({ club, nation });
      expect(r.clubs).toHaveLength(30);
      expect(r.nations).toHaveLength(48);
      const f = r.clubs.map((x) => x.fans);
      expect([...f].sort((a, b) => b - a)).toEqual(f);
      await resetRole(c);
      await asRole(c, "anon");
      const anon = await c.query<{ r: { mine: unknown } }>("select public.get_fan_ranking() as r");
      expect(anon.rows[0]!.r.mine).toBeNull();
    });
  });
});

describe("start_tournament: prioridad de favorito", () => {
  it("1 humano con favorito → le toca su selección", async () => {
    await withRollback(async (c) => {
      const [club] = await codes(c, "arg", 1);
      const [, nation] = await codes(c, "worldcup", 2);
      const u = await fanUser(c, club!, nation!);
      const { teams, all } = await startWith(c, "worldcup", [u]);
      expect(teams).toEqual([nation]);
      expect(new Set(all).size).toBe(48);
    });
  });

  it("Argentino: 1 humano → su club", async () => {
    await withRollback(async (c) => {
      await enableArgMode(c);
      const [, , club] = await codes(c, "arg", 3);
      const [nation] = await codes(c, "worldcup", 1);
      const u = await fanUser(c, club!, nation!);
      const { teams, all } = await startWith(c, "arg", [u]);
      expect(teams).toEqual([club]);
      expect(new Set(all).size).toBe(30);
    });
  });

  it("2 con el mismo favorito: uno lo gana; el otro recibe uno que nadie de la sala tenga de favorito", async () => {
    await withRollback(async (c) => {
      const [club] = await codes(c, "arg", 1);
      const [n1, n2] = await codes(c, "worldcup", 2);
      const a = await fanUser(c, club!, n1!);
      const b = await fanUser(c, club!, n1!);
      const d = await fanUser(c, club!, n2!);
      const { teams } = await startWith(c, "worldcup", [a, b, d]);
      expect(teams.filter((t) => t === n1)).toHaveLength(1);
      expect(teams[2]).toBe(n2);
      const loser = teams[0] === n1 ? teams[1] : teams[0];
      expect([n1, n2]).not.toContain(loser);
    });
  });

  it("favoritos cruzados + invitados: cada uno el suyo; los invitados nunca un favorito de la sala", async () => {
    await withRollback(async (c) => {
      const [club] = await codes(c, "arg", 1);
      const ns = await codes(c, "worldcup", 4);
      const fansIn = [await fanUser(c, club!, ns[0]!), await fanUser(c, club!, ns[1]!), await fanUser(c, club!, ns[2]!)];
      const noFav = await createUser(c, name("nofav"));
      const g1 = await guest(c);
      const g2 = await guest(c);
      const { teams, all } = await startWith(c, "worldcup", [...fansIn, noFav, g1, g2]);
      expect(teams.slice(0, 3)).toEqual(ns.slice(0, 3));
      for (const t of teams.slice(3)) expect(ns.slice(0, 3)).not.toContain(t);
      expect(new Set(all).size).toBe(48); // nadie repite, todos juegan
    });
  });

  it("sala llena (30 en Argentino, todos del mismo club): uno lo tiene y el resto completa los 29 restantes", async () => {
    await withRollback(async (c) => {
      await enableArgMode(c);
      const [club] = await codes(c, "arg", 1);
      const [nation] = await codes(c, "worldcup", 1);
      const users: string[] = [];
      for (let i = 0; i < 30; i++) users.push(await fanUser(c, club!, nation!));
      const { teams, all } = await startWith(c, "arg", users);
      expect(teams.filter((t) => t === club)).toHaveLength(1);
      expect(new Set(teams).size).toBe(30);
      expect(all).toHaveLength(30); // sin bots
    });
  });

  it("es determinista por seed (mismo sorteo si se repite)", async () => {
    await withRollback(async (c) => {
      const [club] = await codes(c, "arg", 1);
      const [n1] = await codes(c, "worldcup", 1);
      const users = [await fanUser(c, club!, n1!), await fanUser(c, club!, n1!)];
      const { teams } = await startWith(c, "worldcup", users);
      expect(teams.filter((t) => t === n1)).toHaveLength(1);
      expect(teams.every(Boolean)).toBe(true);
    });
  });
});
