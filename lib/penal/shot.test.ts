import { describe, expect, it } from "vitest";
import { BALL_T0, BALL_T1, BALL_T2, GOAL_H, GOAL_HALF_W, GOAL_Z, SPOT, ballAt, netBulge, shotPlan } from "./shot";

const REASONS = ["goal", "save", "miss_wide"] as const;

describe("shotPlan / ballAt", () => {
  it("es determinista y arranca en el punto del penal", () => {
    for (const r of REASONS)
      for (let v = 0; v < 4; v++) {
        expect(shotPlan(r, v)).toEqual(shotPlan(r, v));
        expect(ballAt(shotPlan(r, v), 0)).toEqual([...SPOT]);
        expect(ballAt(shotPlan(r, v), BALL_T0)).toEqual([...SPOT]);
      }
  });

  it("llega al objetivo en BALL_T1 y es continua", () => {
    for (const r of REASONS)
      for (let v = 0; v < 4; v++) {
        const plan = shotPlan(r, v);
        const at = ballAt(plan, BALL_T1);
        at.forEach((c, i) => expect(c).toBeCloseTo(plan.target[i]!));
        for (let t = 0; t < BALL_T2; t += 0.01) {
          const a = ballAt(plan, t);
          const b = ballAt(plan, t + 0.01);
          expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), `${r}/${v} @${t}`).toBeLessThan(0.4);
        }
      }
  });

  it("el gol entra al arco, el rechazo queda adelante y el error sale afuera", () => {
    for (let v = 0; v < 4; v++) {
      const g = shotPlan("goal", v).target;
      expect(Math.abs(g[0])).toBeLessThan(GOAL_HALF_W);
      expect(g[1]).toBeLessThan(GOAL_H);
      expect(g[2]).toBeLessThan(GOAL_Z);

      const s = shotPlan("save", v).target;
      expect(s[2]).toBeGreaterThan(GOAL_Z);

      const m = shotPlan("miss_wide", v).target;
      expect(Math.abs(m[0]) > GOAL_HALF_W || m[1] > GOAL_H).toBe(true);
    }
  });

  it("en el gol el arquero va al lado equivocado; en la atajada, al correcto", () => {
    for (let v = 0; v < 4; v++) {
      const g = shotPlan("goal", v);
      expect(Math.sign(g.target[0])).toBe(-g.keeperDir);
      const s = shotPlan("save", v);
      expect(Math.sign(s.target[0])).toBe(s.keeperDir);
    }
  });

  it("la red solo se comba en el gol", () => {
    expect(netBulge(shotPlan("goal", 1), BALL_T1 + 0.15)).toBeGreaterThan(0.5);
    expect(netBulge(shotPlan("save", 1), BALL_T1 + 0.15)).toBe(0);
    expect(netBulge(shotPlan("goal", 1), 5)).toBe(0);
  });
});
