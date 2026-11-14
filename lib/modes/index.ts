/**
 * Registro de MODOS del front (Tanda 2.0). Todo lo que cambia entre modos y no es regla de juego vive
 * acá: nombres, textos, sustantivos ("Grupo"/"Zona", "selección"/"club") y nombres de fase. La REGLA
 * (formato, desempate) está en `lib/engine/formats.ts` y su autoridad es `public.game_modes`.
 *
 * Sumar un modo = una entrada en `FORMATS` + una acá + su catálogo en `data/` + fila en `game_modes`.
 */
import { FORMATS, type FormatConfig, type ModeId } from "@/lib/engine/formats";
import type { MatchPhase } from "@/lib/realtime/score";

export type { ModeId };

export interface ModeMeta {
  id: ModeId;
  /** Nombre del modo en el selector ("Mundial", "Fútbol argentino"). */
  name: string;
  /** Bajada corta del selector. */
  tagline: string;
  /** Cómo se llama una agrupación de la fase inicial ("Grupo" / "Zona"). */
  zoneNoun: string;
  /** Nombre de la fase inicial en plural ("Grupos" / "Zonas"). */
  zonesLabel: string;
  /** Sustantivo del equipo ("selección" / "club"). */
  teamNoun: string;
  /** Título del campeón. */
  championTitle: string;
  /** Sub-identidad del modo en el sistema "Programa": color de su filete/sello (clase Tailwind). */
  swatch: string;
  format: FormatConfig;
}

export const MODE_LIST: readonly ModeMeta[] = [
  {
    id: "worldcup",
    name: "Mundial",
    tagline: "48 selecciones · 12 grupos · 16avos",
    zoneNoun: "Grupo",
    zonesLabel: "Grupos",
    teamNoun: "selección",
    championTitle: "Campeón del Mundo",
    swatch: "bg-blue",
    format: FORMATS.worldcup,
  },
  {
    id: "arg",
    name: "Fútbol argentino",
    tagline: "30 clubes · 2 zonas · octavos",
    zoneNoun: "Zona",
    zonesLabel: "Zonas",
    teamNoun: "club",
    championTitle: "Campeón de la Liga",
    swatch: "bg-brand",
    format: FORMATS.arg,
  },
];

const BY_ID = new Map<string, ModeMeta>(MODE_LIST.map((m) => [m.id, m]));

export function isModeId(x: unknown): x is ModeId {
  return typeof x === "string" && BY_ID.has(x);
}

/** Meta del modo; cae a Mundial si llega algo desconocido (datos viejos / fila sin modo). */
export function getMode(id: string | null | undefined): ModeMeta {
  return BY_ID.get(id ?? "") ?? MODE_LIST[0]!;
}

/** Fases de eliminación en orden de juego (el 3er puesto antes de la final, que es el clímax). */
export const KO_PHASES: readonly MatchPhase[] = [
  "round_of_32",
  "round_of_16",
  "quarters",
  "semis",
  "third_place",
  "final",
];

/** Fases de eliminación que juega un modo (desde su arranque; 3er puesto solo si lo tiene). */
export function koPhasesFor(mode: ModeMeta): MatchPhase[] {
  const start = KO_PHASES.indexOf(mode.format.knockoutStart);
  return KO_PHASES.slice(start).filter((p) => p !== "third_place" || mode.format.thirdPlace);
}

const PHASE_SHORT: Record<Exclude<MatchPhase, "group">, string> = {
  round_of_32: "16avos",
  round_of_16: "Octavos",
  quarters: "Cuartos",
  semis: "Semis",
  third_place: "3er puesto",
  final: "Final",
};

const PHASE_IN: Record<Exclude<MatchPhase, "group">, string> = {
  round_of_32: "16avos",
  round_of_16: "octavos",
  quarters: "cuartos",
  semis: "semifinales",
  third_place: "el partido por el 3er puesto",
  final: "la final",
};

/** Nombre corto de una fase (columnas del árbol, captions). */
export function phaseLabel(mode: ModeMeta, phase: MatchPhase): string {
  return phase === "group" ? mode.zonesLabel : PHASE_SHORT[phase];
}

/** Fase como complemento: "Eliminado en {…}". */
export function phaseInText(mode: ModeMeta, phase: MatchPhase): string {
  return phase === "group" ? `fase de ${mode.zonesLabel.toLowerCase()}` : PHASE_IN[phase];
}
