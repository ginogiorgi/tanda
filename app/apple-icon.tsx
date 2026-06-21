import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand/icon";

/** Apple touch icon (iOS "agregar a inicio"): "T" dorada refinada sobre negro, las esquinas las redondea iOS. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(brandIcon(size.width), { ...size });
}
