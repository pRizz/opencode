# Upstream Sync Playbook

## Baseline Snapshot (2026-02-06)

- Upstream repo/branch: `anomalyco/opencode` `dev`
- Fork repo/branch: `pRizz/opencode` `dev`
- Merge base: see `docs/upstream-sync/merge-base.txt`
- Current divergence: `0` behind / `431` ahead (`git rev-list --left-right --count upstream/dev...origin/dev`)
- `parent-dev` mirror status: `0 0` (`git rev-list --left-right --count upstream/dev...origin/parent-dev`)
- Catch-up status: upstream catch-up complete; fork decoupling restored post-catch-up.
- Post-catch-up snapshot artifact: `docs/upstream-sync/post-catchup-state.txt`

## Patchset Report

- Restore manifest: `docs/upstream-sync/restore-missing-commits.txt`
- Restore file map: `docs/upstream-sync/restore-file-map.txt`
- Upstream first-parent list: `docs/upstream-sync/upstream-first-parent.txt`
- Boundary commits: `docs/upstream-sync/boundary-commits.txt`

To regenerate:

```bash
git fetch upstream --tags
git branch -f parent-dev upstream/dev
git log --oneline dev..sync/decouple-fork-layer > docs/upstream-sync/restore-missing-commits.txt
git diff --name-status dev...sync/decouple-fork-layer > docs/upstream-sync/restore-file-map.txt
MERGE_BASE=$(git merge-base parent-dev dev)
echo "$MERGE_BASE" > docs/upstream-sync/merge-base.txt
git rev-list --first-parent ${MERGE_BASE}..parent-dev > docs/upstream-sync/upstream-first-parent.txt
awk 'NR % 200 == 0 {print NR ":" $0}' docs/upstream-sync/upstream-first-parent.txt > docs/upstream-sync/boundary-commits.txt
wc -l docs/upstream-sync/upstream-first-parent.txt > docs/upstream-sync/upstream-first-parent.count
```

## Must-Keep Fork Areas (Verify and Extend)

- `docs/upstream-sync/fork-feature-audit.md` (authoritative ownership map)
- `packages/fork-*` (fork behavior implementation)
- Hook/stub surfaces under `packages/opencode/src/**` (must stay minimal)

## Known Conflict Notes

- None recorded yet. Add entries here as they appear during the merge train.

## Merge Train Procedure (One-Time Catch-Up)

1. Pause new work on `dev` until catch-up completes.
2. Use `docs/upstream-sync/boundary-commits.txt` to select boundary commits.
3. For each boundary commit:
   - Create a branch `sync/catchup-<n>` from `dev`.
   - Merge the boundary commit, resolve conflicts, and update this doc with resolutions.
   - Regenerate SDK artifacts if the SDK changes: `./packages/sdk/js/script/build.ts`.
   - Open a PR to `dev` labeled `sync` and merge after CI passes.

## Ongoing Sync Automation

- Script: `script/sync-upstream.ts` (phase-based: `--phase merge|test|post-resolve|create-issue`)
- Workflow: `.github/workflows/sync-upstream.yml` (runs every 30 minutes)
- Mirror verification script: `script/verify-upstream-mirror.sh`
- Required secrets:
  - `UPSTREAM_SYNC_TOKEN` — GitHub token for repo operations (falls back to `${{ github.token }}`)
  - `ANTHROPIC_API_KEY` — Anthropic API key for Claude Code Action (conflict resolution + test fixes)
- Workflow behavior:
  - Verifies mirror health before running sync:
    - fails only if `origin/parent-dev` has commits not in `upstream/dev` (unsafe drift)
    - allows upstream-ahead stale state and lets sync refresh `parent-dev` via force update
  - Updates `parent-dev` to match `upstream/dev` (force push).
  - Attempts merge (no tests in merge phase — testing is a separate workflow step).
  - After merge (or conflict resolution), runs post-merge dependency/install + test gate:
    - `bun install` (post-merge, non-frozen)
    - auto-commits tracked `**/bun.lock` updates produced by that install
    - `bun ./packages/sdk/js/script/build.ts` (regenerates SDK types from OpenAPI spec)
    - `bun turbo typecheck`
    - installs Playwright dependencies
    - runs `bun run test:e2e:local -- --workers=2` in `packages/app`
  - On success, rebases the sync branch onto latest `origin/dev` with `git rebase --rebase-merges origin/dev` and pushes directly to `dev`.
  - If the direct push is rejected as non-fast-forward, refetches/rebases and retries push once.
  - Creates/uses labels in the fork repository (`sync-conflict`, `sync-e2e-failure`, `sync-push-failure`) via CLI.
  - On conflict, invokes Claude Code Action (`anthropics/claude-code-action@v1`) to resolve automatically:
    - Claude reads `docs/upstream-sync/fork-feature-audit.md` for ownership context
    - Resolves conflicts per fork ownership rules (upstream-owned vs fork-owned files)
    - After resolution, script runs typecheck + e2e tests
  - On test failure (clean merge or post-conflict), invokes Claude to fix errors:
    - Up to 2 fix attempts, each followed by a test re-run
    - Claude receives test failure output and fixes code without running tests itself
  - On post-resolve rebase/push failure, pushes backup sync branch and creates issue labeled `sync-push-failure`
  - On failure (Claude exhausts attempts), creates an issue with `sync-conflict` or `sync-e2e-failure` label

Manual dispatch and monitoring:

```bash
gh workflow run sync-upstream.yml --ref dev --repo pRizz/opencode
gh run list --workflow sync-upstream.yml --repo pRizz/opencode --limit 1
gh run view <run-id> --repo pRizz/opencode --log
```

Conflict handling (automated):

1. Claude Code Action resolves conflicts using fork-feature-audit.md as ownership source of truth.
2. Script runs typecheck + e2e tests after resolution.
3. If tests fail, Claude attempts fixes (up to 2 retries).
4. If successful, sync rebases onto latest `origin/dev` and pushes directly to `dev`.
5. If final rebase/push fails, workflow pushes the backup sync branch and files a `sync-push-failure` issue.

Conflict handling (manual fallback):

1. Check the `sync-conflict` issue for merge-base and conflict context.
2. Create `sync/catchup-hotfix-<date>` from `dev`.
3. Resolve conflicts with `docs/upstream-sync/fork-feature-audit.md` as ownership source of truth.
4. Regenerate SDK, run typecheck/smoke, and merge immediately.

Post-merge validation order (automated by `runTestGate()`, manual fallback listed here):

1. `bun ./packages/sdk/js/script/build.ts` (regenerate SDK types)
2. `bun turbo typecheck`
3. `bun run test:e2e:local` in `packages/app`
4. Smoke in `packages/opencode`: `bun run dev:web` then `bun dev`

## Steady-State Verification Cadence

- Daily quick check:
  - `gh run list --workflow sync-upstream.yml --repo pRizz/opencode --limit 5`
  - confirm recent `sync-upstream` runs are green.
- Daily divergence check:
  - `git fetch origin dev && git fetch upstream dev`
  - `git rev-list --left-right --count upstream/dev...origin/dev`
  - `git rev-list --left-right --count upstream/dev...origin/parent-dev`
- Weekly manual drill:
  - `gh workflow run sync-upstream.yml --ref dev --repo pRizz/opencode`
  - confirm logs include:
    - `parent-dev mirror verified: upstream/dev...origin/parent-dev = 0 0`
    - `Upstream is already merged. Nothing to sync.` (when no-op)

## Repo Settings Checklist

- Require `typecheck` and `test (linux)` checks on `dev`.
- Allow merge commits.
- Disable force pushes to `dev`.
- Allow the sync actor/token (`UPSTREAM_SYNC_TOKEN` or `github.token`) to push directly to `dev`.
