import { beforeAll, describe, expect, it } from "vitest";
import { CELEBRATION_IDS, CELEBRATIONS, celebrationFor, type CelebrationId } from "./celebrations";
import { loadFkAvatar, type FkAvatar } from "./fkNode";
import { REST, samplePose } from "./rig";
import type { BodyType } from "./types";

/**
 * Feedback 4 #16 con el avatar REAL (GLB + retarget, sin navegador): cada festejo respeta el piso, apoya los pies
 * donde tiene que apoyarlos y su "foto" final es la del festejo (no una pose parecida). Los criterios salen de
 * `docs/celebrations.md`; la QA visual (`pnpm qa:celebrations`) es el complemento.
 */
const BODIES: BodyType[] = ["male", "female"];
const fk = new Map<BodyType, FkAvatar>();
beforeAll(async () => {
  for (const b of BODIES) fk.set(b, await loadFkAvatar(b));
}, 60_000);

type P = { x: number; y: number; z: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const end = (id: CelebrationId) => samplePose(CELEBRATIONS[id], CELEBRATIONS[id].duration);

describe.each(BODIES)("festejos con el GLB %s", (body) => {
  const a = () => fk.get(body)!;
  const restFoot = () => Math.min(a().bone("foot_l", REST).y, a().bone("foot_r", REST).y);

  it.each(CELEBRATION_IDS)("%s: nada atraviesa el piso en todo el clip", (id) => {
    const clip = CELEBRATIONS[id];
    for (let t = 0; t <= clip.duration + 1e-6; t += 0.05) {
      const pose = samplePose(clip, t);
      for (const n of ["Head", "pelvis", "hand_l", "hand_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"]) {
        expect(a().bone(n, pose).y, `${n} @${t.toFixed(2)}`).toBeGreaterThan(-0.02);
      }
    }
  });

  it.each(["siu", "sky", "crossed", "cradle"] as const)("%s: termina parado con los pies en el piso (ni flota ni se hunde)", (id) => {
    const pose = end(id);
    const foot = Math.min(a().bone("foot_l", pose).y, a().bone("foot_r", pose).y);
    expect(Math.abs(foot - restFoot())).toBeLessThan(0.05);
  });

  it("siu: cae con las piernas abiertas y los brazos tirados abajo y afuera", () => {
    const p = end("siu");
    const [fl, fr] = [a().bone("foot_l", p), a().bone("foot_r", p)];
    expect(dist(fl, fr)).toBeGreaterThan(0.45);
    const pelvis = a().bone("pelvis", p);
    for (const h of ["hand_l", "hand_r"]) {
      const hp = a().bone(h, p);
      expect(hp.y, h).toBeLessThan(pelvis.y + 0.15);
      expect(Math.abs(hp.x - pelvis.x), h).toBeGreaterThan(0.35);
    }
  });

  it("sky: las dos manos bien arriba de la cabeza y la mirada al cielo", () => {
    const p = end("sky");
    const head = a().bone("Head", p);
    // Brazos estirados casi verticales: la mano queda ~un antebrazo arriba de la cabeza, encima de su hombro.
    for (const s of ["l", "r"]) {
      const hand = a().bone(`hand_${s}`, p);
      expect(hand.y, s).toBeGreaterThan(head.y + 0.25);
      expect(Math.abs(hand.x - a().bone(`upperarm_${s}`, p).x), s).toBeLessThan(0.25);
    }
    expect(p.joints.head[0]).toBeLessThan(-0.4);
  });

  it("crossed: cada mano llega al brazo contrario, adelante del pecho y sin meterse en el torso", () => {
    const p = end("crossed");
    const chest = a().bone("spine_03", p);
    const [hl, hr] = [a().bone("hand_l", p), a().bone("hand_r", p)];
    expect(dist(hl, a().bone("upperarm_r", p)), "mano izq → brazo der").toBeLessThan(0.3);
    expect(dist(hr, a().bone("upperarm_l", p)), "mano der → brazo izq").toBeLessThan(0.3);
    for (const h of [hl, hr]) {
      expect(dist(h, chest)).toBeGreaterThan(0.1);
      expect(h.y).toBeGreaterThan(a().bone("pelvis", p).y + 0.25);
    }
  });

  it("cradle: antebrazos adelante y casi horizontales, y el cuerpo se balancea de lado a lado", () => {
    for (const t of [0.9, 1.3]) {
      const p = samplePose(CELEBRATIONS.cradle, t);
      for (const s of ["l", "r"]) {
        const [elbow, hand] = [a().bone(`lowerarm_${s}`, p), a().bone(`hand_${s}`, p)];
        expect(Math.abs(hand.y - elbow.y), `${s} @${t}`).toBeLessThan(0.15);
      }
    }
    const ry = (t: number) => samplePose(CELEBRATIONS.cradle, t).root.ry;
    expect(ry(0.9) - ry(1.3)).toBeGreaterThan(0.3);
  });

  it("slide: de rodillas sobre el pasto (rodillas y empeines abajo), torso atrás y brazos abiertos", () => {
    const p = end("slide");
    // Tibia PLANA en el pasto: el tobillo a la altura de la rodilla (antes quedaba levantado atrás).
    for (const s of ["l", "r"]) {
      const [knee, ankle] = [a().bone(`calf_${s}`, p), a().bone(`foot_${s}`, p)];
      expect(knee.y, `rodilla ${s}`).toBeLessThan(0.12);
      expect(ankle.y, `tobillo ${s}`).toBeLessThan(0.12);
      expect(Math.abs(ankle.y - knee.y), `tibia ${s}`).toBeLessThan(0.07);
    }
    const [hl, hr] = [a().bone("hand_l", p), a().bone("hand_r", p)];
    expect(dist(hl, hr)).toBeGreaterThan(1.2);
    expect(p.joints.spine[0]).toBeLessThan(-0.25);
  });
});

describe("elección del festejo", () => {
  it("es determinista por penal (todos los clientes ven el mismo)", () => {
    expect(celebrationFor("3f1c2a9e-0000-4000-8000-000000000001")).toBe(celebrationFor("3f1c2a9e-0000-4000-8000-000000000001"));
  });

  it("los cinco salen con frecuencia parecida", () => {
    const n = 5000;
    const count = new Map<CelebrationId, number>();
    for (let i = 0; i < n; i++) {
      const id = `${(i * 2654435761).toString(16).padStart(8, "0")}-${i.toString(16).padStart(4, "0")}-4000-8000-${(i * 40503).toString(16).padStart(12, "0")}`;
      const c = celebrationFor(id);
      count.set(c, (count.get(c) ?? 0) + 1);
    }
    for (const c of CELEBRATION_IDS) expect(count.get(c) ?? 0, c).toBeGreaterThan(n * 0.15);
  });
});
