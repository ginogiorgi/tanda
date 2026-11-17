// Avatar v2: `profiles.avatar` es siempre v2 (CHECK `profiles_avatar_v2`). El alta de usuario pasa por
// `public.avatar_to_v2`: un v2 válido entra (mujer+rapado → cola, como `parseAvatar`); cualquier otra cosa
// (v1 de antes de P7c, basura) → `avatar_default()` == `DEFAULT_AVATAR`. El compat v1 se fue el 17/11.
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, parseAvatar } from "@/lib/avatar/schema";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";

/** Forma v1 (antes de P7c). */
const V1 = { top: { part: "tee", color: "#e63946" }, hair: { part: "short", color: "#1d1d1d" }, shoes: { part: "sneakers", color: "#f1f1f1" }, bottom: { part: "shorts", color: "#264653" }, bodyType: "male" };

afterAll(closePool);

describe("avatar v2: TS ↔ SQL", () => {
  it("default SQL == DEFAULT_AVATAR", async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query<{ d: unknown }>("select public.avatar_default() as d");
      expect(rows[0]!.d).toEqual(DEFAULT_AVATAR);
    });
  });

  it("v1 y basura → default; v2 válido pasa tal cual", async () => {
    await withRollback(async (c) => {
      const v2 = { ...DEFAULT_AVATAR, body: "female", hair: { style: "long", color: "#CFAE76" } };
      const { rows } = await c.query<{ a: unknown; b: unknown; e: unknown; v: unknown }>(
        "select public.avatar_to_v2($1::jsonb) a, public.avatar_to_v2('{}') b, public.avatar_to_v2(null) e, public.avatar_to_v2($2::jsonb) v",
        [JSON.stringify(v2), JSON.stringify(V1)],
      );
      expect(rows[0]).toEqual({ a: v2, b: DEFAULT_AVATAR, e: DEFAULT_AVATAR, v: DEFAULT_AVATAR });
    });
  });

  it("alta de usuario guarda v2 (sin avatar y con un v1 → default); el CHECK rechaza basura", async () => {
    await withRollback(async (c) => {
      const uid = await createUser(c, "av2_new");
      const r1 = await c.query<{ avatar: unknown }>("select avatar from public.profiles where id = $1", [uid]);
      expect(r1.rows[0]!.avatar).toEqual(DEFAULT_AVATAR);
      await c.query(
        `update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('avatar', $2::jsonb) where id = $1`,
        [uid, JSON.stringify(V1)],
      );
      const r2 = await c.query<{ a: unknown }>(
        "select public.avatar_to_v2(raw_user_meta_data -> 'avatar') a from auth.users where id = $1",
        [uid],
      );
      expect(r2.rows[0]!.a).toEqual(DEFAULT_AVATAR);
      await c.query("savepoint s");
      await expect(c.query("update public.profiles set avatar = $2 where id = $1", [uid, JSON.stringify(V1)])).rejects.toThrow(
        /profiles_avatar_v2/,
      );
      await c.query("rollback to savepoint s");
    });
  });

  it("v2 mujer+rapado → cola de caballo, como parseAvatar", async () => {
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
