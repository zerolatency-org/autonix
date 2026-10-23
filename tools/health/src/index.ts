import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { runChecks, type CheckResult, type Deps } from "./checks";

const execFileAsync = promisify(execFile);

function createDeps(): Deps {
  return {
    exec: async (command, args) => {
      const commandArgs =
        process.platform === "win32" && command === "pnpm"
          ? ["/d", "/s", "/c", "pnpm.cmd", ...args]
          : args;
      const executable =
        process.platform === "win32" && command === "pnpm" ? process.env.ComSpec ?? "cmd.exe" : command;
      const { stdout, stderr } = await execFileAsync(executable, commandArgs, { encoding: "utf8" });
      return `${stdout}${stderr}`;
    },
    nodeVersion: process.version,
    fileExists: (relativePath) => existsSync(relativePath),
  };
}

function formatResult(result: CheckResult): string {
  return `${result.status.toUpperCase().padEnd(4)} ${result.name}: ${result.detail}`;
}

const results = await runChecks(createDeps());

for (const result of results) {
  console.log(formatResult(result));
}

if (results.some((result) => result.status === "fail")) {
  process.exitCode = 1;
}
