
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });

const MANUAL = "packages/chain-escrow/manual";
const OLLAMA_URL = (
  process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"
).replace(/\/$/, "");

const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const DEFAULT_AMOUNT = process.env.DEMO_AMOUNT ?? "0.01";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ask(question) {
  return (await rl.question(question)).trim();
}

function runScript(script, ...args) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Running ${script}\n`);

    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@autonix/chain-escrow",
        "exec",
        "tsx",
        `${MANUAL}/${script}`,
        ...args,
      ],
      { stdio: "inherit", shell: false }
    );

    child.once("error", reject);

    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with exit code ${code}`));
    });
  });
}

async function askOllama(prompt, system) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      system,
      prompt,
      stream: false,
      options: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama HTTP ${response.status}. Check the URL and model.`
    );
  }

  const data = await response.json();

  if (!data.response?.trim()) {
    throw new Error("Ollama returned an empty response.");
  }

  return data.response.trim();
}

async function stage(message, delay = 2000) {
  console.log(`\n⏳ ${message}`);
  await sleep(delay);
}

async function main() {
  console.log("\n====================================");
  console.log("       AUTONIX INTERACTIVE DEMO");
  console.log("====================================");
  console.log(`Model: ${MODEL}`);
  console.log("Network: Local Anvil (chain ID 31337)\n");

  const task = await ask("What task should Atlas complete?\n> ");

  if (!task) throw new Error("Please enter a task.");

  await stage("Atlas is analysing your request...", 1000);

  const plan = await askOllama(
    `User task:\n${task}\n\nExplain briefly how you would approach it and whether a specialist could help. Do not claim any actions have happened.`,
    "You are Atlas, the coordinator agent in Autonix. Be concise and honest."
  );

  console.log(`\n🤖 ATLAS\n${plan}\n`);

  const hire = (
    await ask("Would you like to hire a specialist? [y/N] ")
  ).toLowerCase();

  if (!["y", "yes"].includes(hire)) {
    await stage("Atlas is working on the task...", 1000);

    const answer = await askOllama(
      task,
      "You are Atlas. Complete the user's task directly. Do not claim blockchain actions."
    );

    console.log("\n========== FINAL OUTPUT ==========\n");
    console.log(answer);
    return;
  }

  const amountInput = await ask(
    `Escrow amount in test ETH [${DEFAULT_AMOUNT}]: `
  );

  const amount = amountInput || DEFAULT_AMOUNT;

  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("Enter a positive ETH amount.");
  }

  console.log("\n🔎 Finding a specialist...");
  await sleep(3000);

  console.log("🤖 Selected the configured demo provider account.");

  console.log("\n🛠️ SPECIALIST");
  console.log("The specialist is working on your task...");

  // Generate a real result with Ollama before starting escrow.
  // This avoids creating a job if the model is unavailable.
  const result = await askOllama(
    `Complete this task and return the actual deliverable:\n\n${task}\n\nIf code is requested, provide code in a fenced code block. Do not merely describe what you would do.`,
    "You are a specialist agent hired through Autonix. Do the requested work. Never claim code was executed or tested unless it actually was."
  );

  console.log("✓ Specialist has generated a result.");

  console.log("\n🔗 Starting local blockchain workflow...");

  await runScript("01-deploy.ts");
  await stage("Preparing provider identity...");

  await runScript("02-mint-provider.ts");
  await stage("Creating and funding the escrow job...");

  await runScript("03-create-job.ts", task, amount);
  await stage("Waiting for provider acceptance...");

  await runScript("04-accept.ts");
  await stage("Submitting specialist delivery...");

  await runScript("05-deliver.ts", result);

  console.log("\n🔍 VERIFIER");
  await stage("Evaluating the delivered result...", 1500);

  const verdict = await askOllama(
    `Original task:\n${task}\n\nDelivered result:\n${result}\n\nDecide whether the result substantially satisfies the task. Your first line MUST be exactly PASS or FAIL. Follow with one short reason.`,
    "You are a strict task verifier. PASS only if the deliverable substantially satisfies the original request."
  );

  console.log(`\n${verdict}\n`);

  const passed = /^PASS\b/i.test(verdict);

  await runScript(
    "06-settle.ts",
    passed ? "pass" : "fail",
    passed ? "90" : "25"
  );

  if (passed) {
    await stage("Provider is withdrawing the settled payment...");
    await runScript("07-withdraw.ts");
  }

  console.log("\n====================================");
  console.log("         SPECIALIST OUTPUT");
  console.log("====================================\n");

  console.log(result);

  console.log("\n====================================");
  console.log(
    passed
      ? "✓ Verifier approved the result."
      : "✗ Verifier rejected the result; check the refund."
  );
}

main()
  .catch((error) => {
    console.error("\n❌ DEMO STOPPED");
    console.error(error.message);
    console.error(
      "Check Anvil, Ollama connectivity, and the manual scripts."
    );
    process.exitCode = 1;
  })
  .finally(() => rl.close());
