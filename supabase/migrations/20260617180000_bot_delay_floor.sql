-- Tanda — F10 / 10.5: subir el delay de los bots +2s al MÍNIMO y al MÁXIMO en todos los tiers
-- (respondían demasiado rápido). Port fiel de lib/engine/bot.ts: ventana 4s..(7/8/9/10)s. accuracy
-- intacta. El máximo de low llega a 10s = ventana del penal (precompute_bot_intents clampea al
-- deadline). Verificado por paridad TS↔SQL (parity.test.ts).
create or replace function public.engine_bot_intent(
  p_tier public.difficulty_tier, p_seed bigint,
  out will_be_correct boolean, out delay_ms int
)
language plpgsql immutable set search_path = '' as $$
declare
  mask constant bigint := 4294967295;
  delay_salt constant bigint := 2654435769;  -- 0x9e3779b9
  acc numeric; min_d int; max_d int; delay_seed bigint;
begin
  case p_tier
    when 'elite'  then acc := 0.8; min_d := 4000; max_d := 7000;
    when 'high'   then acc := 0.7; min_d := 4000; max_d := 8000;
    when 'medium' then acc := 0.6; min_d := 4000; max_d := 9000;
    else               acc := 0.5; min_d := 4000; max_d := 10000;  -- low
  end case;
  will_be_correct := public.engine_mulberry32(p_seed) < acc * 4294967296;
  delay_seed := (p_seed # delay_salt) & mask;
  delay_ms := min_d + public.engine_rand_int(delay_seed, max_d - min_d + 1);
end;
$$;
revoke all on function public.engine_bot_intent(public.difficulty_tier, bigint)
  from public, anon, authenticated;
