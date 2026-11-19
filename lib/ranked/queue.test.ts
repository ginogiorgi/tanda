import { describe, expect, it } from "vitest";
import { othersWaiting, waitingLabel } from "./queue";

describe("cola ranked: N esperando", () => {
  it("no te cuenta a vos", () => {
    expect(othersWaiting({ me: [{}] }, "me")).toBe(0);
    expect(othersWaiting({ me: [{}], a: [{}] }, "me")).toBe(1);
    expect(othersWaiting({ me: [{}], a: [{}], b: [{}] }, "me")).toBe(2);
  });
  it("varias pestañas del mismo jugador cuentan como uno", () => {
    expect(othersWaiting({ me: [{}, {}], a: [{}, {}, {}] }, "me")).toBe(1);
  });
  it("keys vacías o sin presencias no cuentan", () => {
    expect(othersWaiting({ "": [{}], a: [], me: [{}] }, "me")).toBe(0);
  });
  it("etiqueta", () => {
    expect(waitingLabel(0)).toBe("0 esperando");
    expect(waitingLabel(1)).toBe("1 esperando");
    expect(waitingLabel(12)).toBe("12 esperando");
    expect(waitingLabel(-1)).toBe("0 esperando");
  });
});
