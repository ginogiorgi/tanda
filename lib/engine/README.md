# Motor (engine)

Funciones **puras y deterministas** del juego, sin I/O ni red (testeables con Vitest).
La aleatoriedad entra siempre como parámetro (`seed`). Ver SPEC §1.2.

- `penalty.ts` — resolución de un penal (tabla §5.2): GOL / ATAJADO / segunda chance. (F3)
- `match.ts` — tanda de 5, alternancia kicker/keeper, muerte súbita. (F3)
- `tournament.ts` — grupos, mejores terceros, bracket, desempates. (F6)

Las Edge Functions / RPC son una capa fina que invoca este motor con `now()` del servidor.
