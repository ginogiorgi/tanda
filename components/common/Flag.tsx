/**
 * Bandera real de una nación (B5.1). SVGs LOCALES en `public/flags/<code>.svg` (set lipis/flag-icons,
 * MIT — ver `public/flags/LICENSE.flag-icons.txt`), servidos como estáticos; no CDN. El `code` es el
 * `flag` del `ParticipantBrief` (= `nations.flag_asset`, ISO-2 en minúscula, `gb-eng`/`gb-sct` para UK).
 *
 * Lazy + tree-shaken en runtime: el navegador solo descarga la bandera que se renderiza (no las 48),
 * con `loading="lazy"`. SVG chico de proporción fija → `next/image` no aportaría optimización (la
 * descartaría igual), así que va un `<img>` con dimensiones por aspect-ratio.
 */

const ASSET_PATH = "/flags";

export function Flag({
  code,
  name,
  className = "h-4",
}: {
  code: string | null | undefined;
  name?: string | null;
  className?: string;
}) {
  if (!code) return null;
  // SVG estático de proporción fija: next/image no optimiza SVGs y agregaría peso sin beneficio; lazy
  // nativo + aspect-ratio evitan CLS, por eso un <img> plano.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${ASSET_PATH}/${code}.svg`}
      alt={name ? `Bandera de ${name}` : ""}
      loading="lazy"
      decoding="async"
      className={`aspect-[4/3] w-auto shrink-0 rounded-[3px] object-cover ring-1 ring-black/10 ${className}`}
    />
  );
}
