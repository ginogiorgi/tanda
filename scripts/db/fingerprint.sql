-- Huella del esquema (Plan 5 T): un md5 por sección de lo que definen las migraciones. Corre igual en la DB
-- local (`pnpm db:fingerprint`) y en prod (MCP execute_sql con este mismo archivo): si una sección difiere,
-- hay drift (p. ej. pg_net sin crear en prod, grants heredados). Solo `public` + lo que tocamos afuera.
with f as (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k,
         -- Sin comentarios ni espacios: el MCP de prod aplica las migraciones sin los comentarios `--`.
         md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) || p.prosecdef || coalesce(array_to_string(p.proconfig, ','), '') as v,
         coalesce(p.proacl::text, '') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
t as (
  select c.relname as k, c.relrowsecurity::text || coalesce(c.relacl::text, '') as acl,
         (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull
                            || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), ',' order by a.attnum)
          from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
)
select 'functions' as section, count(*)::int as n, md5(string_agg(k || '=' || v, '|' order by k)) as hash from f
union all select 'function_grants', count(*)::int, md5(string_agg(k || '=' || acl, '|' order by k)) from f
union all select 'tables', count(*)::int, md5(string_agg(k || '=' || cols, '|' order by k)) from t
union all select 'table_rls_grants', count(*)::int, md5(string_agg(k || '=' || acl, '|' order by k)) from t
union all select 'policies', count(*)::int,
  md5(string_agg(schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, ',')
                 || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by schemaname, tablename, policyname))
  from pg_policies where schemaname in ('public', 'realtime')
union all select 'triggers', count(*)::int, md5(string_agg(c.relname || '.' || tg.tgname || ':' || pg_get_triggerdef(tg.oid), '|' order by c.relname, tg.tgname))
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not tg.tgisinternal
union all select 'extensions', count(*)::int, md5(string_agg(extname, '|' order by extname))
  from pg_extension where extname in ('pg_cron', 'pg_net', 'citext', 'pgcrypto', 'pg_stat_statements', 'supabase_vault')
union all select 'cron_jobs', count(*)::int, md5(string_agg(jobname || ':' || schedule || ':' || md5(command), '|' order by jobname))
  from cron.job
order by 1;
