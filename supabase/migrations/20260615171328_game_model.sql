-- Tanda — F3 / tarea 3.1: modelo de datos del juego (§2 SPEC) + RLS base.
--
-- RLS: el event trigger `rls_auto_enable` activa RLS en cada tabla nueva de public, así que
-- todas quedan deny-all por defecto. Acá solo abrimos lo claramente seguro:
--   - `nations`: SELECT para authenticated (datos públicos de selección).
--   - `questions`: SIN policy de SELECT → el cliente nunca lee la tabla (ni `correct_index`);
--     la pregunta viaja por Broadcast desde el servidor. Lectura completa solo service_role.
-- Las políticas de lectura por pertenencia (rooms/participants/matches/penalties/…) y las
-- escrituras de juego (vía RPC SECURITY DEFINER) se definen en F4, cuando se fija la
-- semántica de salas/lobby. Hoy ningún cliente lee esas tablas (motor TS puro; historial
-- stub), por lo que deny-all es lo correcto. Ver SPEC §2, §3, §4, §5.

-- ───────────────────────── Enums ─────────────────────────
create type public.difficulty       as enum ('easy', 'medium', 'hard', 'very_hard');
create type public.difficulty_tier  as enum ('elite', 'high', 'medium', 'low');
create type public.room_status       as enum ('lobby', 'starting', 'in_progress', 'finished', 'cancelled');
create type public.tournament_status as enum ('in_progress', 'finished');
create type public.tournament_phase  as enum ('groups', 'round_of_32', 'round_of_16', 'quarters', 'semis', 'final', 'finished');
create type public.match_phase        as enum ('group', 'round_of_32', 'round_of_16', 'quarters', 'semis', 'third_place', 'final');
create type public.match_status       as enum ('pending', 'in_progress', 'sudden_death', 'finished');
create type public.penalty_status     as enum ('pending', 'open', 'second_chance', 'resolved');
create type public.answer_phase       as enum ('first', 'second_chance');

-- ───────────────────────── nations ─────────────────────────
-- Seed estático (clasificados 2026) en F5.0. `kit_primary` tiñe la camiseta del avatar en
-- el penal (SPEC §8.3 #1); `kit_secondary` queda reservado a futuro.
create table public.nations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  fifa_rank       int,
  difficulty_tier public.difficulty_tier not null,
  accent_color    text,
  flag_asset      text,
  kit_primary     text,
  kit_secondary   text,
  created_at      timestamptz not null default now()
);
comment on table public.nations is 'Selecciones (clasificados 2026). Seed en F5.0.';

create policy "nations_select_authenticated"
  on public.nations for select to authenticated using (true);

-- ───────────────────────── questions ─────────────────────────
-- `correct_index` es server-only: esta tabla NO tiene policy de SELECT (deny-all al cliente).
create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,
  difficulty    public.difficulty not null,
  prompt        text not null,
  options       jsonb not null,
  correct_index int not null,
  explanation   text,
  created_at    timestamptz not null default now(),
  constraint options_are_three check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 3),
  constraint correct_index_range check (correct_index between 0 and 2)
);
comment on column public.questions.correct_index is 'Server-only: nunca se expone al cliente hasta resolver el penal.';

-- ───────────────────────── rooms ─────────────────────────
create table public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  host_id    uuid references auth.users (id) on delete set null,
  status     public.room_status not null default 'lobby',
  starts_at  timestamptz not null,
  created_at timestamptz not null default now()
);
-- Backstop del tick(): salas en lobby vencidas.
create index rooms_lobby_starts_at_idx on public.rooms (starts_at) where status = 'lobby';

-- ───────────────────────── tournaments ─────────────────────────
create table public.tournaments (
  id                        uuid primary key default gen_random_uuid(),
  room_id                   uuid not null unique references public.rooms (id) on delete cascade,
  status                    public.tournament_status not null default 'in_progress',
  current_phase             public.tournament_phase not null default 'groups',
  seed                      bigint not null,
  champion_participant_id   uuid,
  third_place_participant_id uuid,
  created_at                timestamptz not null default now()
);
comment on column public.tournaments.seed is 'Gobierna sorteos/bracket/bot_intents → reproducible y testeable.';

-- ───────────────────────── participants ─────────────────────────
-- 48 por torneo; user_id null = bot. placement/eliminated_phase para el historial.
create table public.participants (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  nation_id        uuid not null references public.nations (id),
  is_bot           boolean not null default false,
  group_letter     text,
  seed             int,
  eliminated_phase public.match_phase,
  placement        int,
  created_at       timestamptz not null default now()
);
create index participants_tournament_idx on public.participants (tournament_id);
create index participants_user_idx on public.participants (user_id) where user_id is not null;

-- FK lógica de tournaments → participants (se agrega después para evitar dependencia circular).
alter table public.tournaments
  add constraint tournaments_champion_fk
    foreign key (champion_participant_id) references public.participants (id) on delete set null,
  add constraint tournaments_third_place_fk
    foreign key (third_place_participant_id) references public.participants (id) on delete set null;

-- ───────────────────────── matches ─────────────────────────
create table public.matches (
  id                   uuid primary key default gen_random_uuid(),
  tournament_id        uuid not null references public.tournaments (id) on delete cascade,
  phase                public.match_phase not null,
  group_letter         text,
  bracket_slot         int,
  home_participant_id  uuid references public.participants (id) on delete set null,
  away_participant_id  uuid references public.participants (id) on delete set null,
  home_score           int not null default 0,
  away_score           int not null default 0,
  winner_participant_id uuid references public.participants (id) on delete set null,
  status               public.match_status not null default 'pending',
  is_bot_only          boolean not null default false,
  created_at           timestamptz not null default now()
);
create index matches_tournament_idx on public.matches (tournament_id);
create index matches_status_idx on public.matches (status);

-- ───────────────────────── penalties ─────────────────────────
-- idx = 1..5 (o ronda de muerte súbita). Timestamps los fija el servidor.
create table public.penalties (
  id                   uuid primary key default gen_random_uuid(),
  match_id             uuid not null references public.matches (id) on delete cascade,
  idx                  int not null,
  kicker_participant_id uuid not null references public.participants (id),
  keeper_participant_id uuid not null references public.participants (id),
  question_id          uuid references public.questions (id),
  difficulty           public.difficulty not null,
  started_at           timestamptz,
  deadline             timestamptz,
  status               public.penalty_status not null default 'pending',
  second_chance        boolean not null default false,
  removed_option       int,
  resolution           jsonb,
  created_at           timestamptz not null default now()
);
create index penalties_match_idx on public.penalties (match_id);
-- Backstop del tick(): penales abiertos vencidos.
create index penalties_open_deadline_idx on public.penalties (deadline)
  where status in ('open', 'second_chance');

-- ───────────────────────── penalty_answers ─────────────────────────
-- Una fila por (penalty, participant, phase); option_index/selected_at se actualizan en
-- cada cambio (se guarda la última selección con su timestamp server).
create table public.penalty_answers (
  id             uuid primary key default gen_random_uuid(),
  penalty_id     uuid not null references public.penalties (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  option_index   int,
  selected_at    timestamptz,
  is_correct     boolean,
  is_random      boolean not null default false,
  phase          public.answer_phase not null default 'first',
  unique (penalty_id, participant_id, phase)
);
create index penalty_answers_penalty_idx on public.penalty_answers (penalty_id);

-- ───────────────────────── bot_intents ─────────────────────────
-- Precomputado al abrir cada penal y al entrar en segunda chance / muerte súbita.
create table public.bot_intents (
  id                  uuid primary key default gen_random_uuid(),
  penalty_id          uuid not null references public.penalties (id) on delete cascade,
  participant_id      uuid not null references public.participants (id) on delete cascade,
  phase               public.answer_phase not null default 'first',
  scheduled_answer_at timestamptz,
  will_be_correct     boolean,
  chosen_option       int,
  materialized        boolean not null default false,
  unique (penalty_id, participant_id, phase)
);
create index bot_intents_penalty_idx on public.bot_intents (penalty_id);
-- Backstop del tick(): intents vencidos sin materializar.
create index bot_intents_pending_idx on public.bot_intents (scheduled_answer_at)
  where materialized = false;

-- ───────────────────────── tournament_questions ─────────────────────────
-- No-repeat intra-torneo (PK compuesta).
create table public.tournament_questions (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  question_id   uuid not null references public.questions (id) on delete cascade,
  primary key (tournament_id, question_id)
);
