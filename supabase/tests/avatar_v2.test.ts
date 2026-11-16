// Avatar v2 (feedback 2, P7c): `public.avatar_to_v2` es un port fiel de `migrateAvatar` (TS) y las paletas
// SQL son las de `lib/avatar/palette.ts`. La migración deja todo `profiles.avatar` en v2 y el CHECK
// rechaza basura; el alta de usuario siempre guarda v2 (aunque un front viejo mande v1).
import { afterAll, describe, expect, it } from "vitest";
import { makeRng, randInt } from "@/lib/engine/rng";
import { PALETTES } from "@/lib/avatar/catalog";
import { DEFAULT_AVATAR, migrateAvatar, parseAvatar } from "@/lib/avatar/schema";
import { PROD_V1 } from "@/lib/avatar/fixtures";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";

afterAll(closePool);

describe("avatar v2: TS ↔ SQL", () => {
  it("paletas SQL == lib/avatar/palette.ts", async () => {
    await withRollback(async (c) => {
      for (const [kind, pal] of Object.entries(PALETTES)) {
        const { rows } = await c.query<{ p: string[] }>("select public.avatar_palette($1) as p", [kind]);
        expect(rows[0]!.p, kind).toEqual(pal.map((s) => s.hex));
      }
    });
  });

  it("default SQL == DEFAULT_AVATAR", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ d: unknown }>("select public.avatar_default() as d");
      expect(rows[0]!.d).toEqual(DEFAULT_AVATAR);
    });
  });

  it("paridad avatar_to_v2 ↔ migrateAvatar: avatares de prod + 2000 v1 al azar", async () => {
    const rng = makeRng(0xa7a2);
    const hex = () => `#${Math.floor(rng() * 0x1000000).toString(16).padStart(6, "0")}`;
    const pick = <T,>(xs: readonly T[]): T => xs[randInt(rng, xs.length)]!;
    const color = () => pick<() => unknown>([hex, hex, hex, () => pick(PALETTES.kit).hex.toLowerCase(), () => "rojo", () => null, () => 7])();
    const cases: unknown[] = [...PROD_V1];
    for (let i = 0; i < 2000; i++) {
      cases.push({
        bodyType: pick(["male", "female", "x"]),
        hair: { part: pick(["none", "buzz", "mohawk", "short", "long", "bun", "afro"]), color: color() },
        top: { part: "tee", color: color() },
        bottom: rng() < 0.9 ? { part: "shorts", color: color() } : "x",
        shoes: { part: "cleats", color: color() },
      });
    }
    await withRollback(async (c) => {
      const { rows } = await c.query<{ out: unknown[] }>(
        "select array_agg(public.avatar_to_v2(x) order by n) as out from jsonb_array_elements($1::jsonb) with ordinality as t(x, n)",
        [JSON.stringify(cases)],
      );
      const sql = rows[0]!.out;
      cases.forEach((raw, i) => expect(sql[i], JSON.stringify(raw)).toEqual(migrateAvatar(raw)));
    });
  });

  it("basura → default; v2 válido pasa tal cual", async () => {
    await withRollback(async (c) => {
      const v2 = { ...DEFAULT_AVATAR, body: "female", hair: { style: "long", color: "#CFAE76" } };
      const { rows } = await c.query<{ a: unknown; b: unknown; e: unknown }>(
        "select public.avatar_to_v2($1::jsonb) a, public.avatar_to_v2('{}') b, public.avatar_to_v2(null) e",
        [JSON.stringify(v2)],
      );
      expect(rows[0]).toEqual({ a: v2, b: DEFAULT_AVATAR, e: DEFAULT_AVATAR });
    });
  });

  it("alta de usuario guarda v2 (sin avatar y con v1 de un front viejo); el CHECK rechaza basura", async () => {
    await withRollback(async (c) => {
      const uid = await createUser(c, "av2_new");
      const r1 = await c.query<{ avatar: unknown }>("select avatar from public.profiles where id = $1", [uid]);
      expect(r1.rows[0]!.avatar).toEqual(DEFAULT_AVATAR);
      await c.query(
        `update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('avatar', $2::jsonb) where id = $1`,
        [uid, JSON.stringify(PROD_V1[0])],
      );
      const r2 = await c.query<{ a: unknown }>(
        "select public.avatar_to_v2(raw_user_meta_data -> 'avatar') a from auth.users where id = $1",
        [uid],
      );
      expect(r2.rows[0]!.a).toEqual(migrateAvatar(PROD_V1[0]));
      await c.query("savepoint s");
      await expect(c.query("update public.profiles set avatar = $2 where id = $1", [uid, JSON.stringify(PROD_V1[0])])).rejects.toThrow(
        /profiles_avatar_v2/,
      );
      await c.query("rollback to savepoint s");
    });
  });

  it("v2 mujer+rapado (front viejo) → cola de caballo, como parseAvatar", async () => {
    await withRollback(async (c) => {
      const old = { ...DEFAULT_AVATAR, body: "female", hair: { style: "buzz", color: "#1E1B19" } };
      const { rows } = await c.query<{ a: unknown }>("select public.avatar_to_v2($1::jsonb) a", [JSON.stringify(old)]);
      expect(rows[0]!.a).toEqual(parseAvatar(old));
      expect(rows[0]!.a).toMatchObject({ hair: { style: "ponytail" } });
    });
  });

  it("como authenticated: guardar avatar v2 y cambiar el username pasan el CHECK (sin permisos extra)", async () => {
    await withRollback(async (c) => {
      const uid = await createUser(c, "av2_self");
      await asRole(c, "authenticated", uid);
      const v2 = { ...DEFAULT_AVATAR, skin: "#4D3020" };
      await c.query("update public.profiles set avatar = $2 where id = $1", [uid, JSON.stringify(v2)]);
      await c.query("update public.profiles set username = 'av2_self_2' where id = $1", [uid]);
      await resetRole(c);
      const { rows } = await c.query<{ avatar: unknown; username: string }>("select avatar, username from public.profiles where id = $1", [uid]);
      expect(rows[0]).toEqual({ avatar: v2, username: "av2_self_2" });
    });
  });
});
