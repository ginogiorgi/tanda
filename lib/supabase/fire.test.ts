import { describe, expect, it } from "vitest";
import { fire } from "./fire";

describe("fire", () => {
  it("ejecuta un thenable perezoso (como el builder de PostgREST)", async () => {
    let sent = 0;
    const lazy: PromiseLike<number> = {
      then(onOk, onErr) {
        sent++;
        return Promise.resolve(1).then(onOk, onErr);
      },
    };
    fire(lazy);
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toBe(1);
  });

  it("traga el error (el cron es el respaldo)", async () => {
    fire(Promise.reject(new Error("x")));
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("fire con label: registra el error en la telemetría", () => {
  it("error de PostgREST ({ error }) y rechazo de red → rpc_error:<label>; ok → nada", async () => {
    const { resetTelemetryForTests, setExternalReporter } = await import("@/lib/telemetry/client");
    resetTelemetryForTests();
    const seen: [string, unknown][] = [];
    setExternalReporter((k, d) => seen.push([k, d]));
    fire(Promise.resolve({ data: null, error: { code: "P0001", message: "rate_limited" } }), "resolve_penalty");
    fire(Promise.reject(new Error("Failed to fetch")), "open_next_round");
    fire(Promise.resolve({ data: 1, error: null }), "begin_presentation");
    fire(Promise.reject(new Error("sin label")));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([
      ["rpc_error:resolve_penalty", { code: "P0001", message: "rate_limited" }],
      ["rpc_error:open_next_round", { code: "network", message: "Error: Failed to fetch" }],
    ]);
    resetTelemetryForTests();
  });
});
