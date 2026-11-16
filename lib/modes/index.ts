/**
 * Registro de MODOS del front (Tanda 2.0). Todo lo que cambia entre modos y no es regla de juego vive
 * acá: nombres, textos, sustantivos ("Grupo"/"Zona", "selección"/"club") y nombres de fase. La REGLA
 * (formato, desempate) está en `lib/engine/formats.ts` y su autoridad es `public.game_modes`.
 *
 * Sumar un modo = una entrada en `FORMATS` + una acá + su catálogo en `data/` + fila en `game_modes`.
 */
import { FORMATS, type FormatConfig, type ModeId } from "@/lib/engine/formats";
import { kicksPerSide } from "@/lib/engine/match";
import type { MatchPhase } from "@/lib/realtime/score";

export type { ModeId };

/**
 * Ayuda de una forma de jugar (feedback 2, P6). OBLIGATORIA en el registro: un modo sin ayuda no
 * compila, y `modes_help.test.ts` (db) exige que cada `game_modes` activo tenga su entrada.
 */
export interface ModeHelp {
  /** Cómo es el torneo / la partida. */
  format: string;
  /** Contra quién jugás. */
  players: string;
  /** Cómo se gana. */
  win: string;
  /** Si suma o no a la liga. */
  ranked: string;
}

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
  help: ModeHelp;
}

const GROUP_KICKS = kicksPerSide("group");
const KO_KICKS = kicksPerSide("elimination");
const NOT_RANKED = "No suma puntos de liga: para eso está Ranked.";

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
    help: {
      format: `${FORMATS.worldcup.roomSize} selecciones en ${FORMATS.worldcup.zones} grupos de ${FORMATS.worldcup.zoneSize}. Pasan las ${FORMATS.worldcup.qualifiersPerZone} primeras de cada grupo y los ${FORMATS.worldcup.bestThirds} mejores terceros a 16avos; de ahí, mata-mata hasta la final (con partido por el 3er puesto).`,
      players: `Jugás vos contra ${FORMATS.worldcup.roomSize - 1} rivales: personas o bots que completan los lugares.`,
      win: `En grupos, tanda de ${GROUP_KICKS} penales por lado (3, 1 o 0 puntos). En el mata-mata, ${KO_KICKS} por lado y, si empatan, muerte súbita.`,
      ranked: NOT_RANKED,
    },
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
    help: {
      format: `${FORMATS.arg.roomSize} clubes en ${FORMATS.arg.zones} zonas de ${FORMATS.arg.zoneSize}. Pasan los ${FORMATS.arg.qualifiersPerZone} mejores de cada zona a octavos y se define a mata-mata, sin 3er puesto.`,
      players: `Jugás vos contra ${FORMATS.arg.roomSize - 1} rivales: personas o bots que completan los lugares.`,
      win: `En la zona, tanda de ${GROUP_KICKS} penales por lado (3, 1 o 0 puntos). En el mata-mata, ${KO_KICKS} por lado y, si empatan, muerte súbita.`,
      ranked: NOT_RANKED,
    },
  },
];

/** Formas de jugar que no son un `game_mode` de torneo (cards de /jugar), con la misma ayuda. */
export type PlayKindId = "ranked" | "room";
export interface PlayKind {
  id: PlayKindId;
  name: string;
  help: ModeHelp;
}

export const PLAY_KINDS: Record<PlayKindId, PlayKind> = {
  ranked: {
    id: "ranked",
    name: "Ranked 1v1",
    help: {
      format: `Un mano a mano: una tanda de ${KO_KICKS} penales por lado y, si empatan, muerte súbita.`,
      players: "Contra otra persona de nivel parecido (nunca un bot).",
      win: "Ganar suma puntos de liga y perder resta; cuánto, depende del nivel del rival. Con los puntos subís o bajás de división.",
      ranked: "Es lo único que mueve tu ranking.",
    },
  },
  room: {
    id: "room",
    name: "Con amigos",
    help: {
      format: "Creá una sala eligiendo el modo y pasales el código: entran con «Unirse». El torneo es el mismo que el del modo que elegiste.",
      players: `La sala arranca a los ${FORMATS.worldcup.lobbyS} segundos o cuando se llena; los lugares vacíos los completan bots.`,
      win: "Igual que en el modo elegido.",
      ranked: NOT_RANKED,
    },
  },
};

const BY_ID = new Map<string, ModeMeta>(MODE_LIST.map((m) => [m.id, m]));

export function isModeId(x: unknown): x is ModeId {
  return typeof x === "string" && BY_ID.has(x);
}

/** Meta del modo o `null` si el id no está en el registro (lo usa el test que exige ayuda por modo). */
export function findMode(id: string): ModeMeta | null {
  return BY_ID.get(id) ?? null;
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
