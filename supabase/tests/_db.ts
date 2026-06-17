// Helper de la suite `db` (Vitest project "db"): conexión directa al Postgres local de Supabase.
//
// Por qué pg directo y no supabase-js: necesitamos correr las RPC `SECURITY DEFINER` (varias
// revocadas a `authenticated`), vencer deadlines a mano (fast-forward sin dormir) y cambiar de rol
// (`anon`/`authenticated`) para el anti-trampa — todo como superuser. Cada test corre dentro de una
// transacción que SIEMPRE hace rollback (`withRollback`) → aislamiento total sin resetear la DB.
//
// Requiere la DB levantada: `pnpm db:start && pnpm db:reset`. En CI lo hace el job `db`.
import { Pool, type PoolClient } from "pg";

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: DB_URL, max: 4 });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Corre `fn` en una transacción que SIEMPRE se revierte. Aísla cada test sin reset. */
export async function withRollback<T>(
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

type Role = "anon" | "authenticated" | "service_role";

/**
 * Cambia el rol de PostgREST y el `sub` del JWT para lo que resta de la transacción.
 * `auth.uid()` lee `request.jwt.claim.sub`. Volvé a superuser con `resetRole`.
 */
export async function asRole(
  c: PoolClient,
  role: Role,
  sub?: string,
): Promise<void> {
  // `role` sale de un union fijo (no input de usuario) → interpolar es seguro.
  await c.query(`set local role ${role}`);
  await c.query("select set_config('request.jwt.claim.sub', $1, true)", [
    sub ?? "",
  ]);
}

/**
 * Vuelve al rol superuser (postgres) y LIMPIA el `sub` del JWT. Importante: `reset role` NO borra
 * el GUC del claim, así que sin esto `auth.uid()` seguiría devolviendo el último usuario y las RPC
 * que distinguen "poke de cron (uid null)" de "poke de cliente" (open_next_round, resolve_penalty)
 * harían el chequeo de pertenencia de más. El driver simula el contexto server/cron → uid null.
 */
export async function resetRole(c: PoolClient): Promise<void> {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claim.sub', '', true)");
}

/**
 * Crea un usuario real (`auth.users`) y deja que el trigger arme su `profiles`.
 * Devuelve el uuid. Pensado para los e2e que llaman RPCs como ese usuario.
 */
export async function createUser(
  c: PoolClient,
  username: string,
): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_sso_user, is_anonymous)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
        'authenticated', $1, crypt('test-pass', gen_salt('bf')), now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', $2::text), false, false)
     returning id`,
    [`${username}@users.tanda2026.com.ar`, username],
  );
  return rows[0]!.id;
}

/** Atajo: query suelta en una conexión nueva (auto-commit). Para lecturas read-only de chequeo. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}
