import { describe, expect, it } from "vitest";
import { loginBlockedFor, registerLoginFailure, registerLoginSuccess } from "./login-throttle";

describe("login throttle", () => {
  it("даёт 5 попыток, потом паузу, которая растёт", () => {
    const keys = ["login:test1"];
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) registerLoginFailure(keys, t);
    expect(loginBlockedFor(keys, t)).toBe(0);
    registerLoginFailure(keys, t);
    expect(loginBlockedFor(keys, t)).toBe(30);
    registerLoginFailure(keys, t);
    expect(loginBlockedFor(keys, t)).toBe(60);
    expect(loginBlockedFor(keys, t + 61_000)).toBe(0);
  });

  it("сбрасывается после удачного входа и по истечении окна", () => {
    const keys = ["login:test2"];
    for (let i = 0; i < 6; i++) registerLoginFailure(keys, 0);
    registerLoginSuccess(keys);
    expect(loginBlockedFor(keys, 0)).toBe(0);
    for (let i = 0; i < 6; i++) registerLoginFailure(["login:test3"], 0);
    expect(loginBlockedFor(["login:test3"], 16 * 60_000)).toBe(0);
  });
});
