import { describe, expect, it } from "vitest";
import { isAtLeast, parseVersion } from "./versions";

describe("parseVersion", () => {
  it("reads three-part versions", () => {
    expect(parseVersion("git version 2.43.0")).toEqual([2, 43, 0]);
  });
  it("reads two-part versions", () => {
    expect(parseVersion("v22.1")).toEqual([22, 1, 0]);
  });
  it("finds the version inside noisy text", () => {
    expect(parseVersion("forge Version: 1.8.4\nCommit SHA: abc")).toEqual([1, 8, 4]);
  });
  it("returns null when there is no version", () => {
    expect(parseVersion("hello")).toBeNull();
  });
});

describe("isAtLeast", () => {
  it("accepts equal versions", () => {
    expect(isAtLeast([22, 0, 0], [22, 0, 0])).toBe(true);
  });
  it("accepts a newer major", () => {
    expect(isAtLeast([23, 0, 0], [22, 5, 9])).toBe(true);
  });
  it("rejects an older minor", () => {
    expect(isAtLeast([9, 1, 9], [9, 2, 0])).toBe(false);
  });
  it("rejects an older major even if the minor is bigger", () => {
    expect(isAtLeast([21, 99, 99], [22, 0, 0])).toBe(false);
  });
});
