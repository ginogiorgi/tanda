-- Guardrail base: activa RLS automáticamente en cada tabla nueva de `public`, vía el event
-- trigger `ensure_rls`. Existía en el remoto pero se había aplicado FUERA de una migración
-- (nunca se escribió a un archivo) → `supabase db reset` desde archivos fallaba en la migración
-- siguiente (`..090703_revoke_rls_auto_enable_rpc`, que revoca `execute` sobre esta función).
-- Esta migración hace el historial autocontenido. Es idempotente (`create or replace` +
-- `drop ... if exists`) → segura tanto en un local fresco como en el remoto que ya la tiene.
-- Definición tomada tal cual del remoto (proname=rls_auto_enable, event trigger=ensure_rls).
-- Ver memoria tanda-sql-migrations-canonical. Debe correr ANTES del primer `create table`.

create or replace function public.rls_auto_enable()
 returns event_trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
