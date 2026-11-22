/**
 * Chequeo de drift a nivel de TIPOS (Plan 5 T): `database.types.ts` se mantiene a mano (tipa los `jsonb` con
 * nuestras formas reales), y `database.generated.ts` lo genera `pnpm db:types` desde la DB local (en CI se
 * regenera y debe quedar igual al commiteado). Si una RPC o una columna tipada a mano no existe en la DB, o sus
 * argumentos no coinciden en nombre, `pnpm typecheck` falla acá mostrando cuáles.
 */
import type { Database as Hand } from "./database.types";
import type { Database as Gen } from "./database.generated";

type HF = Hand["public"]["Functions"];
type GF = Gen["public"]["Functions"];
type HT = Hand["public"]["Tables"];
type GT = Gen["public"]["Tables"];

type Expect<T extends never> = T;

/** RPC tipadas a mano que no existen en la DB. */
type MissingFunctions = Exclude<keyof HF, keyof GF>;
/** RPC cuyos nombres de argumentos no coinciden con la DB. */
type WrongArgs = {
  [K in keyof HF & keyof GF]: [keyof HF[K]["Args"]] extends [keyof GF[K]["Args"]]
    ? [keyof GF[K]["Args"]] extends [keyof HF[K]["Args"]]
      ? never
      : K
    : K;
}[keyof HF & keyof GF];
/** Tablas tipadas a mano que no existen en la DB. */
type MissingTables = Exclude<keyof HT, keyof GT>;
/** Columnas tipadas a mano que no existen en la DB, como `tabla.columna`. */
type MissingColumns = {
  [K in keyof HT & keyof GT]: Exclude<keyof HT[K]["Row"], keyof GT[K]["Row"]> extends infer C
    ? C extends string
      ? `${K & string}.${C}`
      : never
    : never;
}[keyof HT & keyof GT];

export type DatabaseTypesDrift = [
  Expect<MissingFunctions>,
  Expect<WrongArgs>,
  Expect<MissingTables>,
  Expect<MissingColumns>,
];
