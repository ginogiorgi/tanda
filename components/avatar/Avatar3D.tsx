/**
 * Avatar 3D para las escenas: el personaje GLB (`GlbAvatar`) con el modelo procedural
 * (`AvatarModel`) como fallback mientras baja el GLB. Ambos registran el mismo rig, así que la
 * animación sigue sin cortes cuando se reemplazan. Si el GLB no carga (red, 404), queda el
 * procedural en vez de caerse la escena.
 */

import { Suspense, type ComponentProps } from "react";
import { AvatarModel } from "./AvatarModel";
import { ErrorFallback } from "./ErrorFallback";
import { GlbAvatar } from "./GlbAvatar";

export function Avatar3D(props: ComponentProps<typeof GlbAvatar>) {
  return (
    <ErrorFallback fallback={<AvatarModel {...props} />}>
      <Suspense fallback={<AvatarModel {...props} />}>
        <GlbAvatar {...props} />
      </Suspense>
    </ErrorFallback>
  );
}
