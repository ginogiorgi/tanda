import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { FanRow } from "@/lib/fans/catalog";
import { FanRankingList } from "./FanRankingList";

const rows: FanRow[] = Array.from({ length: 14 }, (_, i) => ({
  code: `T${i + 1}`,
  name: `Equipo ${i + 1}`,
  short: `E${i + 1}`,
  crest: null,
  flag: null,
  fans: 20 - i,
  pos: i + 1,
}));

/** Hijos directos de la Card en orden de documento: [h3, ol, button]. */
function order(card: HTMLElement): string[] {
  return Array.from(card.children).map((el) => el.tagName.toLowerCase());
}

describe("FanRankingList (feedback 4 #1)", () => {
  it("el botón queda al FINAL de la tabla, plegada y desplegada", async () => {
    render(<FanRankingList title="Clubes" rows={rows} mine={null} />);
    const card = screen.getByRole("heading", { name: "Clubes" }).parentElement!;
    const toggle = screen.getByRole("button", { name: "Ver los 14" });
    expect(order(card)).toEqual(["h3", "ol", "button"]);
    expect(within(card).getAllByRole("listitem")).toHaveLength(10);

    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Ver menos" })).toHaveAttribute("aria-expanded", "true");
    expect(order(card)).toEqual(["h3", "ol", "button"]);
    const items = within(card).getAllByRole("listitem");
    expect(items).toHaveLength(14);
    // El último ítem de la lista está antes que el botón (no hay filas después del "Ver menos").
    expect(items.at(-1)!.compareDocumentPosition(screen.getByRole("button")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(within(card).getAllByRole("listitem")).toHaveLength(10);
  });

  it("tu favorito fuera del top aparece plegado y NO se duplica al desplegar", async () => {
    render(<FanRankingList title="Países" rows={rows} mine="T13" />);
    const card = screen.getByRole("heading", { name: "Países" }).parentElement!;
    const mine = () => card.querySelectorAll("li[aria-current=true]");
    expect(mine()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Ver los 14" }));
    expect(mine()).toHaveLength(1);
    expect(mine()[0]).toHaveTextContent("Equipo 13");
  });

  it("sin resto no hay botón", () => {
    render(<FanRankingList title="Clubes" rows={rows.slice(0, 5)} mine={null} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
