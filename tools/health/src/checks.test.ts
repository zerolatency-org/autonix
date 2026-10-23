import { describe, expect, it } from "vitest";
import { type Deps, runChecks } from "./checks";

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  const outputs: Record<string, string> = {
    pnpm: "9.15.9\n",
    git: "git version 2.43.0\n",
    forge: "forge Version: 1.8.4\n",
  };
  return {
    exec: async (command) => {
      const out = outputs[command];
      if (out === undefined) throw new Error("not found");
      return out;
    },
    nodeVersion: "22.4.0",
    fileExists: () => true,
    ...overrides,
  };
}

const statusOf = (results: Awaited<ReturnType<typeof runChecks>>, name: string) =>
  results.find((r) => r.name === name)?.status;

describe("runChecks", () => {
  it("passes when everything is fine", async () => {
    const results = await runChecks(makeDeps());
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });

  it("fails when node is too old", async () => {
    const results = await runChecks(makeDeps({ nodeVersion: "20.11.0" }));
    expect(statusOf(results, "node")).toBe("fail");
  });

  it("fails when forge is not installed", async () => {
    const base = makeDeps();
    const results = await runChecks({
      ...base,
      exec: async (command, args) => {
        if (command === "forge") throw new Error("ENOENT");
        return base.exec(command, args);
      },
    });
    expect(statusOf(results, "forge")).toBe("fail");
  });

  it("warns when a tool prints no readable version", async () => {
    const base = makeDeps();
    const results = await runChecks({
      ...base,
      exec: async (command, args) =>
        command === "git" ? "weird output" : base.exec(command, args),
    });
    expect(statusOf(results, "git")).toBe("warn");
  });

  it("warns (not fails) when .env is missing", async () => {
    const results = await runChecks(makeDeps({ fileExists: () => false }));
    expect(statusOf(results, ".env")).toBe("warn");
  });
});
