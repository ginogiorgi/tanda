-- rls_auto_enable es un event trigger (guardrail que activa RLS en tablas nuevas de
-- public). No debe ser invocable por RPC: se revoca execute. El event trigger sigue
-- funcionando igual (se dispara como definer, no depende de este grant).
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
