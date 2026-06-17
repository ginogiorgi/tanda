// Fixtures mínimos armados a mano (como postgres, salteando RLS) para los tests que NO necesitan
// correr el flujo real de matchmaking. `rooms.host_id` y `participants.user_id` FK a auth.users, así
// que el fixture crea usuarios reales (createUser → trigger arma el profile) y devuelve sus uids.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createUser } from "./_db";

export interface MatchFixture {
  userA: string;
  userB: string;
  roomId: string;
  tournamentId: string;
  pA: string;
  pB: string;
  matchId: string;
}

/** Una sala + torneo + 2 participantes (humanos reales) + 1 match de grupo en curso. */
export async function makeMatchFixture(c: PoolClient): Promise<MatchFixture> {
  const userA = await createUser(c, `a_${randomUUID().slice(0, 8)}`);
  const userB = await createUser(c, `b_${randomUUID().slice(0, 8)}`);
  const roomId = (
    await c.query<{ id: string }>(
      `insert into public.rooms (code, host_id, status, starts_at)
       values ($1, $2, 'in_progress', now()) returning id`,
      [`T${randomUUID().slice(0, 8)}`, userA],
    )
  ).rows[0]!.id;

  const tournamentId = (
    await c.query<{ id: string }>(
      `insert into public.tournaments (room_id, status, seed)
       values ($1, 'in_progress', 12345) returning id`,
      [roomId],
    )
  ).rows[0]!.id;

  const pA = (
    await c.query<{ id: string }>(
      `insert into public.participants (tournament_id, user_id, is_bot, group_letter)
       values ($1, $2, false, 'A') returning id`,
      [tournamentId, userA],
    )
  ).rows[0]!.id;

  const pB = (
    await c.query<{ id: string }>(
      `insert into public.participants (tournament_id, user_id, is_bot, group_letter)
       values ($1, $2, false, 'A') returning id`,
      [tournamentId, userB],
    )
  ).rows[0]!.id;

  const matchId = (
    await c.query<{ id: string }>(
      `insert into public.matches (tournament_id, phase, group_letter,
          home_participant_id, away_participant_id, status)
       values ($1, 'group', 'A', $2, $3, 'in_progress') returning id`,
      [tournamentId, pA, pB],
    )
  ).rows[0]!.id;

  return { userA, userB, roomId, tournamentId, pA, pB, matchId };
}

/**
 * Arma un lobby real con `nUsers` humanos vía las RPC de matchmaking (create_room + join_room) y
 * dispara `start_tournament` (rellena bots, arma 12 grupos + fixture, abre la jornada 1).
 * Devuelve roomId, tournamentId y los uids de los humanos. No avanza el torneo (eso es el driver).
 */
export async function startRealTournament(
  c: PoolClient,
  nUsers: number,
): Promise<{ roomId: string; tournamentId: string; users: string[] }> {
  const { asRole, resetRole } = await import("./_db");
  const users: string[] = [];
  for (let i = 0; i < nUsers; i++) {
    users.push(await createUser(c, `e2e_${i}_${randomUUID().slice(0, 6)}`));
  }

  await asRole(c, "authenticated", users[0]);
  const { rows } = await c.query<{ room_id: string; tournament_id: string; code: string }>(
    "select * from public.create_room()",
  );
  const { room_id: roomId, tournament_id: tournamentId, code } = rows[0]!;
  await resetRole(c);

  for (let i = 1; i < nUsers; i++) {
    await asRole(c, "authenticated", users[i]);
    await c.query("select * from public.join_room($1)", [code]);
    await resetRole(c);
  }

  await c.query("select public.start_tournament($1)", [roomId]);
  return { roomId, tournamentId, users };
}

/** Inserta un penal `open` (deadline +10s) con una pregunta cualquiera. Devuelve su id. */
export async function openManualPenalty(
  c: PoolClient,
  matchId: string,
  kicker: string,
  keeper: string,
  idx = 1,
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into public.penalties
       (match_id, idx, kicker_participant_id, keeper_participant_id, question_id,
        difficulty, status, started_at, deadline)
     values ($1, $2, $3, $4,
        (select id from public.questions where difficulty = 'easy' limit 1),
        'easy', 'open', now(), now() + interval '10 seconds')
     returning id`,
    [matchId, idx, kicker, keeper],
  );
  return rows[0]!.id;
}
