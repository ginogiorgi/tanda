/**
 * "Cómo jugar" (feedback 2, P6): el contenido de la hoja de ayuda de la home. Los números salen de
 * `TIMING` y de las reglas del motor, nunca escritos a mano.
 */
import { kicksPerSide } from "@/lib/engine/match";
import { TIMING } from "@/lib/engine/timing";

export interface HelpSection {
  title: string;
  body: string;
}

export const HOWTO: readonly HelpSection[] = [
  {
    title: "Cada pregunta es un penal",
    body: `Uno patea y el otro ataja. Aparece una pregunta con 3 opciones y tienen ${TIMING.penaltyS} segundos.`,
  },
  {
    title: "Patear y atajar",
    body: "Si acertás y tu rival no, ganás vos: gol si pateabas, atajada si atajabas. Si los dos aciertan, gana el más rápido.",
  },
  {
    title: "Tu primer toque queda fijo",
    body: "No se puede cambiar la respuesta: la rapidez se mide desde ese toque.",
  },
  {
    title: "Si los dos erran",
    body: `Se va la opción que erraron y tienen ${TIMING.secondChanceS} segundos más con las otras dos. Si el que patea vuelve a errar, la tiró afuera.`,
  },
  {
    title: "La tanda",
    body: `${kicksPerSide("group")} penales por lado en la fase de grupos y ${kicksPerSide("elimination")} en el mata-mata; si empatan en el mata-mata, muerte súbita.`,
  },
];
