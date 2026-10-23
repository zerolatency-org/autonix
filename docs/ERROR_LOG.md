# Error Log & Rebuild Insurance

Every time something breaks during development, spikes, or testing, log an entry immediately. This is your rebuild insurance and team memory.

Format:
- **Date**: YYYY-MM-DD
- **Area**: `[0G-Storage | 0G-Compute | 0G-Chain | Foundry | Crypto | Monorepo]`
- **Symptom**: Exactly what error message or abnormal behavior you observed.
- **Cause**: Why it happened.
- **Fix**: What command, code change, or configuration resolved it.
- **Minutes lost**: Time spent debugging.

---

## Logged Entries

### 2026-10-23: forge install put libraries in the wrong folder
- **Area**: `Foundry`
- **Symptom**: `forge install` created `lib/` and `.gitmodules` at the repo root instead of `contracts/lib`.
- **Cause**: `contracts/foundry.toml` did not exist yet, so Foundry treated the git root as the project.
- **Fix**: Deleted the stray `lib/`, `.gitmodules` and `foundry.lock` at the root, created `contracts/foundry.toml` first, then ran `forge install` again from inside `contracts/`.
- **Minutes lost**: 10
