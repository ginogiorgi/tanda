import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand/icon";

/** Favicon/ícono del sitio, generado on-brand (sin assets externos): "T" dorada refinada sobre negro. */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(brandIcon(size.width), { ...size });
}
