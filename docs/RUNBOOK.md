# Runbook: Empty Machine to Running Autonix Project

Operational guide to set up, build, test, and run the **Autonix Network** monorepo (Hacknauts 2.0).

---

## 1. Install Tooling (Once)

### Node.js (>= 22)
- **macOS / Linux**:
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  nvm install 22 && nvm use 22
  ```
- **Windows (PowerShell)**:
  ```powershell
  # Using winget or fnm / nvm-windows
  winget install OpenJS.NodeJS.LTS
  # Or with fnm:
  fnm install 22
  fnm use 22
  ```

### Package Manager: pnpm (>= 9)
```bash
npm install -g pnpm@9
```

### Foundry (Solidity Toolchain)
- **macOS / Linux**:
  ```bash
  curl -L https://foundry.paradigm.xyz | bash
  foundryup
  ```
- **Windows (PowerShell)**:
  ```powershell
  irm https://foundry.paradigm.xyz | iex
  foundryup
  ```

### Local LLM Engine: Ollama (for Phase 0 & Phase 2 dev/fallback)
Install from [ollama.com](https://ollama.com) and pull the target model:
```bash
ollama run llama3.1:8b
```

---

## 2. Clone & Submodules

```bash
git clone --recurse-submodules <repo-url> autonix
cd autonix

# If submodules were missed:
git submodule update --init --recursive
```

---

## 3. Install and Configure

```bash
pnpm install
cp .env.example .env
```

Edit `.env` to configure:
- **0G Galileo Testnet**:
  - `ZG_CHAIN_ID=16602`
  - `ZG_RPC_URL=https://evmrpc-testnet.0g.ai`
  - `ZG_EXPLORER_URL=https://chainscan-galileo.0g.ai`
- **Private Keys** (Testnet only; leave blank until Phase 1 deployments):
  - `DEPLOYER_PRIVATE_KEY`
  - `EVALUATOR_PRIVATE_KEY`
  - `ORACLE_PRIVATE_KEY`
  - `RUNTIME_PRIVATE_KEY`
- **Local Inference**:
  - `OLLAMA_BASE_URL=http://localhost:11434`
  - `OLLAMA_MODEL=llama3.1:8b`

---

## 4. Health & Verification Suite

Run all verification gates before committing code:

```bash
pnpm health               # Verifies node, pnpm, git, forge, and .env
pnpm test                 # TypeScript tests across all workspaces (vitest)
pnpm contracts:test       # Solidity Foundry tests (forge test -vv)
pnpm lint                 # Biome code formatting and linting
pnpm typecheck            # TypeScript compiler check across packages
pnpm build                # Turborepo monorepo build
```

---

## 5. Monorepo Layout

```
apps/
  web/                   Next.js marketplace and chat UI (Tailwind CSS, Viem)
packages/
  ports/                 Domain interfaces (StoragePort, ComputePort, ChainPort) & in-memory fakes
  crypto/                Key derivation, WebCrypto K_u wrapping, AES-GCM envelope
  zg/                    0G adapters (0G Chain, 0G Storage, 0G Compute)
  sdk/                   Shared types, schemas, and API clients
services/
  runtime/               Agent executor, prompt assembly, and chat streaming API
  evaluator/             Automated rubric & deterministic work verification (EIP-712 verdicts)
  oracle/                Safe iNFT transfer re-encryption & proof signing
  indexer/               Chain event listener caching to Postgres
contracts/               Foundry project (AgentINFT, JobEscrow, DeedLedger, AgentSale)
tools/
  health/                Environment and dependency diagnostics
docs/                    Runbook, error log, ADRs, master plan
```

---

## 6. Phased Implementation Roadmap

1. **Phase 0: Foundations & Risk Spikes**
   - 0G testnet wallet, faucet funding, contract deploy spike.
   - 0G Storage blob upload/download spike.
   - 0G Compute provider inference spike (with Ollama fallback).
   - Write ADR-001 through ADR-007.
   - Verify `@autonix/health`.
2. **Phase 1: Core Contracts**
   - `AgentINFT` (ERC-721 base, slots, operator caps, blocked plain transfers).
   - `JobEscrow` (pull payments, accept, commit, settle, owner-at-accept).
   - `DeedLedger` (tamper-evident reputation log).
3. **Phase 2: Private Data Layer**
   - User data key $K_u$ wrapping and cryptographic erasure.
   - Encrypted chat vault with integrity chaining on 0G Storage.
4. **Phase 3: Agent Runtime & Chat**
   - Stateless prompt assembly from 0G bundle.
   - Next.js chat interface and account erasure flow.
5. **Phase 4: Skills & Self-Marketing**
   - Skill manifests, benchmark evaluation, deed-backed metrics.
6. **Phase 5: Tickets, Hiring & Evaluator**
   - Autonomous agent-to-agent task delegation and escrow release.
   - Human approval gates and human provider support.
7. **Phase 6: iNFT Transfer Lifecycle**
   - Atomic sale (`AgentSale`) and Oracle re-encryption of agent key $K_a$.
8. **Phase 7: Demo & Hardening**
   - End-to-end rehearsal on testnet with fallback demo mode.

---

## 7. Working Rules

- **Build and verify locally first**: Never commit code if `pnpm test`, `pnpm contracts:test`, `pnpm lint`, or `pnpm typecheck` fails.
- **Never commit secrets**: Only use testnet wallets; `.env` is git-ignored.
- **Log every failure**: Whenever a toolchain, network, or test breaks, log it in `docs/ERROR_LOG.md` (Symptom, Cause, Fix, Minutes lost).
- **Architecture decisions**: Document design choices using the template in `docs/0000-template.md`.
