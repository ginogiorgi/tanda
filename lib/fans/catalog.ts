import argTeams from "@/data/teams/arg.json";
import wcTeams from "@/data/teams/worldcup.json";

/**
 * Catálogo de favoritos (feedback 3 #15): clubes del modo Argentino y selecciones del Mundial, en orden
 * alfabético para los selectores. Sale de `data/teams/` (lo mismo que siembra `teams`), así el registro no
 * necesita una ida a la DB para listar opciones.
 */
export type FavKind = "club" | "nation";

export interface FavTeam {
  code: string;
  name: string;
  short: string;
  flag: string | null;
  crest: string | null;
}

interface RawTeam {
  code: string;
  name: string;
  short_name: string;
  flag_asset: string | null;
  crest_asset: string | null;
}

const toFav = (t: RawTeam): FavTeam => ({ code: t.code, name: t.name, short: t.short_name, flag: t.flag_asset, crest: t.crest_asset });
const byName = (a: FavTeam, b: FavTeam) => a.name.localeCompare(b.name, "es");

export const FAV_TEAMS: Record<FavKind, readonly FavTeam[]> = {
  club: (argTeams as RawTeam[]).map(toFav).sort(byName),
  nation: (wcTeams as RawTeam[]).map(toFav).sort(byName),
};

export const FAV_LABEL: Record<FavKind, string> = { club: "Club favorito", nation: "País favorito" };

/** Busca por nombre, nombre corto o código, sin tildes ni mayúsculas ("rio" → "Río…", "arg" → Argentina). */
export function searchFav(list: readonly FavTeam[], query: string): FavTeam[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const q = norm(query);
  if (!q) return [...list];
  return list.filter((t) => norm(t.name).includes(q) || norm(t.short).includes(q) || norm(t.code).startsWith(q));
}

export function favByCode(kind: FavKind, code: string | null | undefined): FavTeam | null {
  return FAV_TEAMS[kind].find((t) => t.code === code) ?? null;
}

/** Fila del ranking de hinchas (`get_fan_ranking`). */
export interface FanRow {
  code: string;
  name: string;
  short: string;
  crest: string | null;
  flag: string | null;
  fans: number;
  /** Puesto con empates (rank()). */
  pos: number;
}

export interface FanRanking {
  clubs: FanRow[];
  nations: FanRow[];
  /** null = sin sesión. */
  mine: { club: string | null; nation: string | null } | null;
}

/** Favorito del modo para la sala de espera (`lobby_favorite`). */
export interface LobbyFavorite {
  code: string;
  name: string;
  flag: string | null;
  crest: string | null;
}
