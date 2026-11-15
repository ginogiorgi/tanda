import { describe, expect, it } from "vitest";
import {
  CELEBRATE,
  DEJECTED,
  IDLE,
  JOINTS,
  KEEPER_CELEBRATE,
  KEEPER_DIVE,
  KEEPER_READY,
  KICK,
  KICKER_READY,
  REACTION_AT,
  REST,
  blendPose,
  mirrorPose,
  resolvePose,
  samplePose,
  sequencePose,
  type Clip,
} from "./rig";

const CLIPS: Record<string, Clip> = { IDLE, KICKER_READY, KICK, CELEBRATE, DEJECTED, KEEPER_READY, KEEPER_DIVE, KEEPER_CELEBRATE };

describe("rig", () => {
  it("resolvePose completa todas las articulaciones en 0", () => {
    const p = resolvePose({ joints: { kneeL: [1, 0, 0] } });
    expect(Object.keys(p.joints)).toHaveLength(JOINTS.length);
    expect(p.joints.kneeL).toEqual([1, 0, 0]);
    expect(p.joints.hipR).toEqual([0, 0, 0]);
    expect(p.root).toEqual({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  });

  it("los clips tienen keyframes ordenados y terminan en su duración", () => {
    for (const [name, clip] of Object.entries(CLIPS)) {
      const ts = clip.keys.map((k) => k.t);
      expect([...ts].sort((a, b) => a - b), name).toEqual(ts);
      expect(ts[0], name).toBe(0);
      expect(ts[ts.length - 1], name).toBeCloseTo(clip.duration);
    }
  });

  it("samplePose pasa exacto por los keyframes y clampa al final", () => {
    const k = KICK.keys[2]!;
    expect(samplePose(KICK, k.t)).toEqual(resolvePose(k.pose));
    expect(samplePose(KICK, 99)).toEqual(resolvePose(KICK.keys[KICK.keys.length - 1]!.pose));
    expect(samplePose(KICK, -1)).toEqual(resolvePose(KICK.keys[0]!.pose));
  });

  it("los clips en loop son continuos (empiezan y terminan en la misma pose)", () => {
    for (const clip of [IDLE, KEEPER_READY]) {
      expect(samplePose(clip, 0)).toEqual(samplePose(clip, clip.duration));
      expect(samplePose(clip, 0.3)).toEqual(samplePose(clip, clip.duration + 0.3));
    }
  });

  it("es continuo entre keyframes (sin saltos grandes en 10 ms)", () => {
    for (const [name, clip] of Object.entries(CLIPS)) {
      for (let t = 0; t < clip.duration; t += 0.01) {
        const a = samplePose(clip, t);
        const b = samplePose(clip, t + 0.01);
        for (const j of JOINTS) {
          for (let i = 0; i < 3; i++) {
            expect(Math.abs(a.joints[j][i]! - b.joints[j][i]!), `${name} ${j} @${t}`).toBeLessThan(0.25);
          }
        }
      }
    }
  });

  it("mirrorPose es una involución y espeja la estirada", () => {
    const dive = samplePose(KEEPER_DIVE, 0.75);
    expect(mirrorPose(mirrorPose(dive))).toEqual(dive);
    const m = mirrorPose(dive);
    expect(m.root.x).toBeCloseTo(-dive.root.x);
    expect(m.root.rz).toBeCloseTo(-dive.root.rz);
    expect(m.joints.shoulderR[2]).toBeCloseTo(-dive.joints.shoulderL[2]);
  });

  it("la estirada termina en el piso desplazada hacia +X", () => {
    const end = samplePose(KEEPER_DIVE, KEEPER_DIVE.duration);
    expect(end.root.x).toBeGreaterThan(1);
    expect(end.root.y).toBeLessThan(-0.5);
  });

  it("blendPose interpola y sequencePose no salta al empezar la reacción", () => {
    const mid = blendPose(REST, resolvePose({ root: { y: 1 } }), 0.5);
    expect(mid.root.y).toBeCloseTo(0.5);
    const action = (t: number) => samplePose(KICK, t);
    const before = sequencePose(action, CELEBRATE, REACTION_AT - 0.001);
    const after = sequencePose(action, CELEBRATE, REACTION_AT + 0.001);
    for (const j of JOINTS) expect(Math.abs(before.joints[j][2] - after.joints[j][2])).toBeLessThan(0.05);
  });

  // Feedback 2 (P2.2): ningún estado de la escena espera "parado posando". Antes del remate, pateador y
  // arquero están en pose de preparación: rodillas flexionadas y torso inclinado durante todo el loop.
  it("pateador y arquero esperan en pose de preparación (nunca la de reposo)", () => {
    for (const [name, clip] of Object.entries({ KICKER_READY, KEEPER_READY })) {
      for (let t = 0; t <= clip.duration; t += 0.1) {
        const p = samplePose(clip, t);
        expect(p, `${name} t=${t}`).not.toEqual(REST);
        expect(Math.min(p.joints.kneeL[0], p.joints.kneeR[0]), `${name} rodillas t=${t}`).toBeGreaterThan(0.2);
      }
    }
  });
});

