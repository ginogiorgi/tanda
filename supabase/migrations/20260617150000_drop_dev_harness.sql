-- Tanda — F9 / 9.6: borrar el harness DEV de prueba de penales sueltos.
--
-- `dev_create_practice_penal()` + la ruta /dev/penal eran scaffolding TEMPORAL (4.3) para probar un
-- penal aislado antes de que existiera la pantalla de partido real. Con F8 completo (pantalla de
-- torneo + escena de penal reales) ya sobra, y el advisor de seguridad lo marcaba como SECURITY
-- DEFINER ejecutable en prod. Se borra la función (la ruta y el componente del cliente ya se
-- eliminaron). Idempotente.
drop function if exists public.dev_create_practice_penal();
