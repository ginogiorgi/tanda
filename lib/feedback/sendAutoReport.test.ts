import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAutoReportsForTests, sendAutoReport, shortStack } from "./sendAutoReport";

afterEach(() => {
  resetAutoReportsForTests();
  vi.unstubAllGlobals();
});

describe("shortStack", () => {
  it("primeras 8 líneas y sin el origen del sitio", () => {
    const stack = Array.from({ length: 12 }, (_, i) => `at f${i} (https://tanda2026.com.ar/_next/a.js:1:${i})`).join("\n");
    const s = shortStack(stack, "https://tanda2026.com.ar")!;
    expect(s.split("\n")).toHaveLength(8);
    expect(s).not.toContain("tanda2026.com.ar");
    expect(shortStack(undefined, "x")).toBeNull();
  });
});

describe("sendAutoReport", () => {
  it("manda una sola vez el mismo error por carga de página", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { pathname: "/partido", origin: "https://tanda2026.com.ar" } });
    expect(sendAutoReport({ message: "boom" }, "route")).toBe(true);
    expect(sendAutoReport({ message: "boom" }, "route")).toBe(false);
    expect(sendAutoReport({ message: "otro" }, "route")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ kind: "auto", source: "route", message: "boom", route: "/partido" });
  });
});
