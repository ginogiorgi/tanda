import { describe, it, expect } from "vitest";
import {
  formatRemaining,
  presenceMembers,
  type LobbyPresence,
} from "./presence";

describe("formatRemaining", () => {
  it("formatea minutos y segundos con padding", () => {
    expect(formatRemaining(120_000)).toBe("2:00");
    expect(formatRemaining(119_000)).toBe("1:59");
    expect(formatRemaining(9_000)).toBe("0:09");
    expect(formatRemaining(65_000)).toBe("1:05");
  });

  it("trunca hacia abajo los milisegundos sobrantes", () => {
    expect(formatRemaining(1_999)).toBe("0:01");
  });

  it("clampa a 0:00 en cero y en negativos", () => {
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(-5_000)).toBe("0:00");
  });
});

describe("presenceMembers", () => {
  function p(userId: string, username: string, online_at: number): LobbyPresence {
    return { userId, username, online_at };
  }

  it("estado vacío → lista vacía", () => {
    expect(presenceMembers({})).toEqual([]);
  });

  it("aplana las keys y ordena por orden de llegada", () => {
    const state = {
      b: [p("u2", "Beto", 200)],
      a: [p("u1", "Ana", 100)],
      c: [p("u3", "Caro", 300)],
    };
    expect(presenceMembers(state)).toEqual([
      { userId: "u1", username: "Ana" },
      { userId: "u2", username: "Beto" },
      { userId: "u3", username: "Caro" },
    ]);
  });

  it("deduplica por userId (varias pestañas) y conserva la más vieja", () => {
    const state = {
      u1: [p("u1", "Ana", 500), p("u1", "Ana", 100)],
    };
    expect(presenceMembers(state)).toEqual([{ userId: "u1", username: "Ana" }]);
  });
});
