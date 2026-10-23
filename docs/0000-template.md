# ADR-NNNN: Title

- **Status**: proposed | accepted | superseded
- **Date**: YYYY-MM-DD
- **Deciders**: Team Zerolatency

---

## Planned ADR Registry (Phase 0)

Every major architectural choice in Autonix must be documented in `docs/adr/` using this template:

| ADR ID | Title | Core Decision Area |
|---|---|---|
| **ADR-001** | Compute Path | 0G Compute broker vs. Router, failover to Ollama local/backup |
| **ADR-002** | Key Management & Deletion | Ephemeral wrapped $K_u$, serverless key store, cryptographic erasure proof |
| **ADR-003** | iNFT Architecture | ERC-721 base (ERC-7857 style), `profileURI`, `bundleHash`, `memoryRoot` |
| **ADR-004** | Operator Model | Autonomous agent hiring, per-transaction spending caps, clearance on transfer |
| **ADR-005** | Identity-Bound Balances | Pull payments credited to `balances[tokenId]` vs `balances[address]` |
| **ADR-006** | Evaluator Trust Model | Deterministic test checks + rubric-based LLM verification with EIP-712 signatures |
| **ADR-007** | Chat Write Cadence | Ephemeral session cache, checkpointing to 0G Storage every N turns & session end |

---

## Context

What problem are we solving, and what constraints do we have? Reference relevant 0G Chain, 0G Storage, or 0G Compute specifications.

## Options Considered

1. **Option A**: Description, pros, cons, impact on decentralization and latency.
2. **Option B**: Description, pros, cons, impact on decentralization and latency.

## Decision

What we chose, in one or two clear sentences.

## Consequences

- **What gets easier**: Simplifications, testability, offline verification.
- **What gets harder**: Complexity introduced, network dependencies.
- **Verification & Testing**: Exact test IDs (e.g. `DATA-06`, `ESC-08`, `INFT-05`) that enforce this decision.
