- To test opencode in `packages/opencode`, run `bun dev`.
- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- When pushing, default to `dev` unless otherwise specified.

## Fork Alignment Rules

- This repo is a fork. To keep merges with upstream feasible, avoid broad edits in upstream-owned packages.
- Fork-specific behavior must live in `packages/fork-*` packages.
- Upstream packages may only add **small, stable hook points** that call into fork packages.
- Prefer additive changes over refactors in upstream packages unless required for a fork hook.
- Update `docs/upstream-sync/fork-feature-audit.md` whenever fork behavior changes.
