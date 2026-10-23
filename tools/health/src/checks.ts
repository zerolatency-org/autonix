import { isAtLeast, parseVersion, type Version } from "./versions";

export type Status = "ok" | "warn" | "fail";

export interface CheckResult {
  name: string;
  status: Status;
  detail: string;
}

/** Everything the checks need from the outside world, so tests can fake it. */
export interface Deps {
  exec: (command: string, args: string[]) => Promise<string>;
  nodeVersion: string;
  fileExists: (relativePath: string) => boolean;
}

async function checkTool(
  deps: Deps,
  name: string,
  command: string,
  args: string[],
  minimum: Version,
  hint: string,
): Promise<CheckResult> {
  let output: string;
  try {
    output = await deps.exec(command, args);
  } catch {
    return { name, status: "fail", detail: `not installed. ${hint}` };
  }
  const version = parseVersion(output);
  if (!version) {
    return {
      name,
      status: "warn",
      detail: `found, but could not read a version from: ${output.trim()}`,
    };
  }
  if (!isAtLeast(version, minimum)) {
    return {
      name,
      status: "fail",
      detail: `${version.join(".")} found, need ${minimum.join(".")} or newer. ${hint}`,
    };
  }
  return { name, status: "ok", detail: version.join(".") };
}

export async function runChecks(deps: Deps): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const node = parseVersion(deps.nodeVersion);
  if (node && isAtLeast(node, [22, 0, 0])) {
    results.push({ name: "node", status: "ok", detail: node.join(".") });
  } else {
    results.push({
      name: "node",
      status: "fail",
      detail: `${deps.nodeVersion} found, need 22 or newer. Run: nvm install 22`,
    });
  }

  results.push(
    await checkTool(deps, "pnpm", "pnpm", ["--version"], [9, 0, 0], "Run: npm install -g pnpm"),
  );
  results.push(await checkTool(deps, "git", "git", ["--version"], [2, 30, 0], "Install git."));
  results.push(await checkTool(deps, "forge", "forge", ["--version"], [1, 0, 0], "Run: foundryup"));

  results.push(
    deps.fileExists(".env")
      ? { name: ".env", status: "ok", detail: "found" }
      : { name: ".env", status: "warn", detail: "missing. Run: cp .env.example .env" },
  );

  return results;
}
