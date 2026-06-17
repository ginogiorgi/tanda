// 9.0(e) — Anti-trampa (gotchas no negociables). Verifica las garantías server-authoritative:
// `correct_index` nunca legible por el cliente, escrituras de juego solo por RPC, y los broadcasts
// privados solo visibles para miembros del match/torneo. Todo a nivel rol Postgres (anon/
// authenticated) + RLS, que es exactamente lo que aplica PostgREST/Realtime en producción.
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closePool, withRollback, asRole } from "./_db";
import { makeMatchFixture } from "./_fixtures";

afterAll(closePool);

describe("correct_index nunca viaja al cliente", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} NO puede leer questions.correct_index`, async () => {
      await withRollback(async (c) => {
        await asRole(c, role, randomUUID());
        await expect(
          c.query("select correct_index from public.questions limit 1"),
        ).rejects.toThrow();
      });
    });

    it(`${role} NO ve filas de questions (ni correct_index por SELECT *)`, async () => {
      await withRollback(async (c) => {
        await asRole(c, role, randomUUID());
        // Sin grant de SELECT → permission denied (no "0 filas"): la columna no se filtra, se bloquea.
        await expect(
          c.query("select * from public.questions"),
        ).rejects.toThrow();
      });
    });
  }
});

describe("escrituras de juego: solo por RPC, nunca directas", () => {
  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} NO puede insertar en penalty_answers directo`, async () => {
      await withRollback(async (c) => {
        await asRole(c, role, randomUUID());
        await expect(
          c.query(
            `insert into public.penalty_answers (penalty_id, participant_id, option_index)
             values ($1, $2, 0)`,
            [randomUUID(), randomUUID()],
          ),
        ).rejects.toThrow();
      });
    });

    it(`${role} NO puede insertar penales ni tocar marcadores directo`, async () => {
      await withRollback(async (c) => {
        await asRole(c, role, randomUUID());
        await expect(
          c.query("update public.matches set home_score = 99"),
        ).rejects.toThrow();
      });
    });
  }
});

describe("RPCs autoritativas internas: revocadas a anon/authenticated", () => {
  const internal: Array<[string, string]> = [
    ["start_tournament", "select public.start_tournament($1)"],
    ["open_round", "select public.open_round($1)"],
    ["materialize_bot_intents", "select public.materialize_bot_intents($1, true)"],
    ["tick", "select public.tick()"],
  ];
  for (const role of ["anon", "authenticated"] as const) {
    for (const [name, sql] of internal) {
      it(`${role} NO puede ejecutar ${name}()`, async () => {
        await withRollback(async (c) => {
          await asRole(c, role, randomUUID());
          await expect(
            sql.includes("$1") ? c.query(sql, [randomUUID()]) : c.query(sql),
          ).rejects.toThrow(/permission denied/i);
        });
      });
    }
  }
});

describe("broadcasts privados: solo miembros del match/torneo", () => {
  it("is_match_member / is_tournament_member distinguen miembro de no-miembro", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const { userA, userB } = fx;
      const userC = randomUUID(); // no participa

      const member = async (uid: string, fn: string, arg: string) => {
        await asRole(c, "authenticated", uid);
        const { rows } = await c.query<{ ok: boolean }>(
          `select public.${fn}($1) as ok`,
          [arg],
        );
        await c.query("reset role");
        return rows[0]!.ok;
      };

      expect(await member(userA, "is_match_member", fx.matchId)).toBe(true);
      expect(await member(userB, "is_match_member", fx.matchId)).toBe(true);
      expect(await member(userC, "is_match_member", fx.matchId)).toBe(false);
      expect(await member(userA, "is_tournament_member", fx.tournamentId)).toBe(true);
      expect(await member(userC, "is_tournament_member", fx.tournamentId)).toBe(false);
    });
  });

  it("la policy de realtime.messages oculta el broadcast a un no-miembro", async () => {
    await withRollback(async (c) => {
      const fx = await makeMatchFixture(c);
      const { userA } = fx;
      const userC = randomUUID();
      const topic = `match:${fx.matchId}`;

      // Un broadcast privado en el topic del match (como lo emitiría una RPC con realtime.send).
      await c.query(
        `insert into realtime.messages (topic, extension, event, private, payload)
         values ($1, 'broadcast', 'penal:start', true, '{"idx":1}'::jsonb)`,
        [topic],
      );

      const visibleCount = async (uid: string) => {
        await asRole(c, "authenticated", uid);
        // realtime.topic() lee este GUC; la policy decide por membresía del topic suscripto.
        await c.query("select set_config('realtime.topic', $1, true)", [topic]);
        const { rows } = await c.query<{ n: string }>(
          `select count(*) n from realtime.messages
           where topic = $1 and extension = 'broadcast'`,
          [topic],
        );
        await c.query("reset role");
        return Number(rows[0]!.n);
      };

      expect(await visibleCount(userA)).toBe(1); // miembro: lo ve
      expect(await visibleCount(userC)).toBe(0); // ajeno: no lo ve
    });
  });
});
