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
