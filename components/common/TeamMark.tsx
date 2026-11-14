/**
 * Insignia de un equipo: bandera (selecciones) o escudo propio (clubes). Una sola pieza para todos los
 * modos, así HUD, bracket, historial y presentación no saben de qué modo es el equipo.
 *
 * - Banderas: SVGs LOCALES en `public/flags/<code>.svg` (set lipis/flag-icons, MIT — ver
 *   `public/flags/LICENSE.flag-icons.txt`). `flag` = `teams.flag_asset` (ISO-2 minúscula, `gb-eng`…).
 * - Escudos: SVGs ORIGINALES en `public/crests/<crest>.svg` (`crest` = `teams.crest_asset`, p. ej.
 *   `arg/boca`). No reproducen escudos reales.
 *
 * SVG estático de proporción fija: next/image no optimiza SVGs, así que va un `<img>` lazy con
 * aspect-ratio (evita CLS).
 */

export function TeamMark({
  flag,
  crest,
  name,
  className = "h-4",
}: {
  flag: string | null | undefined;
  crest?: string | null;
  name?: string | null;
  className?: string;
}) {
  if (flag) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/flags/${flag}.svg`}
        alt={name ? `Bandera de ${name}` : ""}
        loading="lazy"
        decoding="async"
        className={`aspect-[4/3] w-auto shrink-0 rounded-[3px] object-cover ring-1 ring-ink/25 ${className}`}
      />
    );
  }
  if (crest) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/crests/${crest}.svg`}
        alt={name ? `Escudo de ${name}` : ""}
        loading="lazy"
        decoding="async"
        className={`aspect-square w-auto shrink-0 object-contain ${className}`}
      />
    );
  }
  return null;
}
