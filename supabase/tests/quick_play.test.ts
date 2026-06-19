// C3 — quick_play sin lock global: correctitud del matchmaking. Dos usuarios distintos deben caer en
// la MISMA sala abierta (no fragmentar), y una sala llena (48) debe derivar en una sala nueva. La
// concurrencia real es difícil de simular en el harness de rollback (una sola conexión); acá
// verificamos la lógica de find-or-create + el guard de cupo bajo el nuevo esquema (FOR UPDATE SKIP
// LOCKED + lock acotado a la creación).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, closePool, createUser, resetRole, withRollback } from "./_db";

afterAll(closePool);

async function quickPlay(c: Parameters<typeof asRole>[0], uid: string) {
  await asRole(c, "authenticated", uid);
  const { rows } = await c.query<{ room_id: string; tournament_id: string; code: string }>(
    "select * from public.quick_play()",
  );
  await resetRole(c);
  return rows[0]!;
}

describe("quick_play (matchmaking sin lock global)", () => {
  it("un 2º usuario cae en la MISMA sala abierta (no crea otra)", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, `qpa_${randomUUID().slice(0, 8)}`);
      const b = await createUser(c, `qpb_${randomUUID().slice(0, 8)}`);

      const ra = await quickPlay(c, a); // no hay sala → crea
      const rb = await quickPlay(c, b); // hay sala abierta → se une a la misma

      expect(rb.room_id).toBe(ra.room_id);

      // Ambos son participantes humanos de ese torneo.
      const { rows } = await c.query<{ n: string }>(
        `select count(*) n from public.participants
          where tournament_id = $1 and is_bot = false`,
        [ra.tournament_id],
      );
      expect(Number(rows[0]!.n)).toBe(2);
    });
  });

  it("reanuda: el mismo usuario vuelve a su sala abierta (idempotente)", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, `qpr_${randomUUID().slice(0, 8)}`);
      const r1 = await quickPlay(c, a);
      const r2 = await quickPlay(c, a);
      expect(r2.room_id).toBe(r1.room_id);

      const { rows } = await c.query<{ n: string }>(
        `select count(*) n from public.participants
          where tournament_id = $1 and user_id = $2`,
        [r1.tournament_id, a],
      );
      expect(Number(rows[0]!.n)).toBe(1); // no se duplicó
    });
  });

  it("sala llena (48) → quick_play crea una sala nueva, no la sobrepasa", async () => {
    await withRollback(async (c) => {
      const a = await createUser(c, `qpf_${randomUUID().slice(0, 8)}`);
      const ra = await quickPlay(c, a); // crea sala 1

      // Rellenar la sala 1 hasta 48 (bots, como postgres saltando RLS).
      await c.query(
        `insert into public.participants (tournament_id, user_id, is_bot)
         select $1, null, true from generate_series(1, 47)`,
        [ra.tournament_id],
      );

      const b = await createUser(c, `qpg_${randomUUID().slice(0, 8)}`);
      const rb = await quickPlay(c, b); // sala 1 llena → debe crear sala 2

      expect(rb.room_id).not.toBe(ra.room_id);

      // La sala 1 quedó en 48 (no se pasó).
      const { rows } = await c.query<{ n: string }>(
        `select count(*) n from public.participants where tournament_id = $1`,
        [ra.tournament_id],
      );
      expect(Number(rows[0]!.n)).toBe(48);
    });
  });
});
