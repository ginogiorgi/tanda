import { describe, it, expect } from "vitest";
import {
  formatRemaining,
  presenceMembers,
  reconcileRoster,
  rosterMembers,
  type LobbyPresence,
  type RosterEntry,
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

describe("reconcileRoster (período de gracia, anti-parpadeo)", () => {
  function p(userId: string, username: string, online_at: number): LobbyPresence {
    return { userId, username, online_at };
  }
  const empty = () => new Map<string, RosterEntry>();

  it("agrega presentes y preserva el orden de llegada", () => {
    let roster = reconcileRoster(empty(), { a: [p("u1", "Ana", 100)] }, 1000);
    roster = reconcileRoster(roster, { a: [p("u1", "Ana", 100)], b: [p("u2", "Beto", 200)] }, 1100);
    expect(rosterMembers(roster)).toEqual([
      { userId: "u1", username: "Ana" },
      { userId: "u2", username: "Beto" },
    ]);
  });

  it("NO descarta a un ausente dentro de la gracia (no parpadea)", () => {
    let roster = reconcileRoster(empty(), { a: [p("u1", "Ana", 100)], b: [p("u2", "Beto", 200)] }, 1000);
    // u2 desaparece transitoriamente; pasaron 2s (< gracia 4s) → sigue visible.
    roster = reconcileRoster(roster, { a: [p("u1", "Ana", 100)] }, 3000);
    expect(rosterMembers(roster).map((m) => m.userId)).toEqual(["u1", "u2"]);
  });

  it("descarta al ausente una vez superada la gracia", () => {
    let roster = reconcileRoster(empty(), { a: [p("u1", "Ana", 100)], b: [p("u2", "Beto", 200)] }, 1000);
    // u2 ausente y ya pasaron > 4s desde su último visto → se quita.
    roster = reconcileRoster(roster, { a: [p("u1", "Ana", 100)] }, 6000);
    expect(rosterMembers(roster).map((m) => m.userId)).toEqual(["u1"]);
  });

  it("un re-track con online_at más nuevo conserva el orden viejo (no salta de lugar)", () => {
    let roster = reconcileRoster(empty(), { a: [p("u1", "Ana", 100)], b: [p("u2", "Beto", 200)] }, 1000);
    // u1 reconecta con online_at mayor; debe seguir primero (conservamos el más viejo).
    roster = reconcileRoster(roster, { a: [p("u1", "Ana", 999)], b: [p("u2", "Beto", 200)] }, 2000);
    expect(rosterMembers(roster).map((m) => m.userId)).toEqual(["u1", "u2"]);
  });
});
