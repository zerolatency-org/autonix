import { describe, expect, it } from "vitest";
import { extractJson } from "./json-extract";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("extracts JSON from a markdown fence", () => {
    const text = 'Sure, here you go:\n```json\n{"a":1}\n```\nLet me know if you need more.';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it("extracts a JSON object embedded in prose with no fence", () => {
    const text = 'Here is the plan: {"steps":[{"id":"s1"}]} hope that helps';
    expect(extractJson(text)).toEqual({ steps: [{ id: "s1" }] });
  });

  it("handles nested braces correctly", () => {
    const text = '{"a":{"b":1},"c":[1,2,3]}';
    expect(extractJson(text)).toEqual({ a: { b: 1 }, c: [1, 2, 3] });
  });

  it("throws when there is no valid JSON anywhere", () => {
    expect(() => extractJson("sorry, I can't do that")).toThrow();
  });

  it("throws on truncated JSON rather than silently returning partial data", () => {
    expect(() => extractJson('{"steps": [ { "id": "s1"')).toThrow();
  });
});
