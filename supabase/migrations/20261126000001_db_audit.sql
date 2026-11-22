-- Feedback 4 · A3 — auditoría de la DB tabla por tabla (detalle en docs/AUDIT.md § DB).
--
--  1) FKs sin índice que cubra (advisor 0001): profiles.fav_club_fk / fav_nation_fk.
--  2) Índice sin uso real: questions_topic_idx (topic solo aparece en un ORDER BY con expresión, que
--     nunca usa el índice). Los otros "sin uso" del advisor cubren FKs → se quedan.
--  3) Invitados (decisión de Gino 22/11): siguen en el ranking, pero los anónimos sin actividad por
--     14 días se borran (cascada: perfil, ranked, premios; sus `participants` quedan con user_id null →
--     los historiales de los demás no se rompen). `profiles.qa_keep` exime cuentas de QA (Fase G).
--  4) Retención de tablas operativas que crecían sin techo: rate_limits, bot_intents ya usados,
--     ops_events (30 días).

-- 1) FKs de favoritos
create index if not exists profiles_fav_club_idx on public.profiles (fav_club_id, fav_club_mode)
  where fav_club_id is not null;
create index if not exists profiles_fav_nation_idx on public.profiles (fav_nation_id, fav_nation_mode)
  where fav_nation_id is not null;

-- 2) Índice muerto
drop index if exists public.questions_topic_idx;

-- 3) Poda de invitados inactivos
alter table public.profiles add column if not exists qa_keep boolean not null default false;
comment on column public.profiles.qa_keep is
  'Cuenta de QA: la poda de invitados inactivos (prune_inactive_guests) no la borra.';

create or replace function public.prune_inactive_guests(p_limit int default 500)
returns int
language plpgsql security definer set search_path to ''
as $$
declare v_n int;
begin
  with victims as (
    select u.id
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.is_anonymous
      and not p.qa_keep
      and greatest(
            u.created_at,
            coalesce(u.last_sign_in_at, u.created_at),
            coalesce((select max(coalesce(s.refreshed_at, s.updated_at, s.created_at))
                        from auth.sessions s where s.user_id = u.id), u.created_at),
            coalesce((select max(t.created_at)
                        from public.participants pa join public.tournaments t on t.id = pa.tournament_id
                        where pa.user_id = u.id), u.created_at)
          ) < now() - interval '14 days'
      -- Nunca a alguien en juego o en cola.
      and not exists (select 1 from public.ranked_queue q where q.user_id = u.id)
      and not exists (
        select 1 from public.participants pa join public.tournaments t on t.id = pa.tournament_id
        where pa.user_id = u.id and t.status in ('pending', 'in_progress')
      )
    limit p_limit
  )
  delete from auth.users u using victims v where u.id = v.id;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.ops_log('guests_pruned', null, jsonb_build_object('count', v_n), 0);
  end if;
  return v_n;
end;
$$;
revoke all on function public.prune_inactive_guests(int) from public, anon, authenticated;

-- 4) Retención operativa
create or replace function public.prune_ops_tables()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  -- Ventanas de rate limit: la más larga es de 1 día.
  delete from public.rate_limits where window_start < now() - interval '2 days';
  -- Intenciones de bot de penales ya cerrados (solo sirven mientras el penal está abierto).
  delete from public.bot_intents bi
    using public.penalties pe
    where pe.id = bi.penalty_id and pe.status = 'resolved' and pe.created_at < now() - interval '1 day';
  delete from public.ops_events where created_at < now() - interval '30 days';
end;
$$;
revoke all on function public.prune_ops_tables() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('tanda-guests-prune', 'tanda-ops-prune');
  perform cron.schedule('tanda-guests-prune', '15 7 * * *', 'select public.prune_inactive_guests()');
  perform cron.schedule('tanda-ops-prune', '45 7 * * *', 'select public.prune_ops_tables()');
end;
$$;
