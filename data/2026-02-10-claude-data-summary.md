# Fork Divergence Data Summary — February 10, 2026

This document was generated alongside the initial run of the fork divergence tracking system (`script/fork-divergence.ts`). It provides a detailed narrative explanation of the data captured in `fork-divergence.csv`, the interesting patterns discovered during development of the tracking system, and a deep analysis of how this fork has evolved relative to its upstream (`anomalyco/opencode`).

---

## Background: How the Fork Divergence Tracker Works

The tracker measures the codebase difference between the `dev` branch of this fork (`pRizz/opencode`) and the `upstream/dev` branch of the upstream repository (`anomalyco/opencode`). It does this by:

1. **Finding the merge base**: `git merge-base HEAD upstream/dev` — this is the most recent common ancestor commit between the two branches, representing the last point where both branches had identical content.

2. **Computing a numstat diff**: `git diff --numstat <merge-base>..HEAD` — this gives per-file counts of lines added and lines removed since that common ancestor.

3. **Classifying files**: Each changed file is categorized using git's `--diff-filter`:
   - **Modified (`M`)**: Files that exist in both the upstream and the fork but have been changed by the fork. These represent modifications to upstream code.
   - **Added (`A`)**: Files that exist only in the fork. These are entirely new files created by the fork (the `fork-*` packages, planning docs, config, etc.).

4. **Tracking velocity**: The number of commits on each side since the merge base, and the age of the merge base itself.

The tracker runs daily via a GitHub Actions workflow (`.github/workflows/fork-divergence.yml`) at midnight UTC, appending a new row to the CSV and updating the summary table in the README.

---

## The Backfill Challenge

When building the tracker, we needed to generate historical data for the days before the tracker existed. This turned out to be surprisingly subtle.

### Problem 1: The `dev` Branch Contains Upstream History

The fork was created as a GitHub fork of `anomalyco/opencode`, which means the `dev` branch inherits the *entire* commit history of the upstream repository going back to March 2025. Running `git log dev` returns commits from March 2025 through today — but the fork didn't actually start diverging until January 19, 2026.

The initial naive approach of walking `git log dev` and grouping by date produced over 300 "days" of history, most of which predated the fork entirely.

**Solution**: We use `git log --left-only dev...upstream/dev` to find commits that exist only on the fork's `dev` branch (not on `upstream/dev`). The earliest such commit gives us the fork's true start date: **January 19, 2026**.

### Problem 2: Upstream Commits Are Interspersed on `dev`

Because the fork periodically syncs with upstream (merging `upstream/dev` into `dev`), the `dev` branch contains both fork-specific commits and upstream commits. When we look at "the last commit on `dev` before midnight on January 25," we might get an upstream commit that was merged in — not a fork-specific one.

When a commit's merge-base with `upstream/dev` is the commit itself, it means the commit is reachable from `upstream/dev` — it's an upstream commit that landed on `dev` via a merge. There is zero fork divergence at that point in time.

This caused many days in the early backfill to show completely zeroed-out metrics (0 modified files, 0 added files, 0 total lines), which was misleading.

**Solution**: We implemented a "carry forward" strategy. For each day:
1. Find the latest commit on `dev` before that day's midnight.
2. Check if it's fork-divergent (merge-base ≠ commit itself).
3. If it is, use it to compute metrics.
4. If it's an upstream commit, carry forward the last known fork-divergent commit's metrics.
5. If no fork-divergent commit has been seen yet, skip the day entirely.

This produces a continuous time series where metrics only change when actual fork work lands, with stable plateaus between changes.

### Problem 3: Merge Base Age and Timezone Edges

The "merge base age" metric (days since the merge base commit was authored) can produce negative values when the merge base was authored later in the day and the script computes the age using a date-only comparison. For example, if the merge base was authored at 6:00 PM on Feb 10 but we compute age on Feb 10 using midnight UTC, the result is -1.

**Solution**: We clamp the age to `Math.max(0, ...)` so it never goes negative.

---

## The Data: What the CSV Tells Us

### Overview of the 18 Data Points

The CSV contains 18 rows spanning January 24 through February 10, 2026. Here is the narrative:

### Phase 1: Initial Fork (January 24, 2026)

| Metric | Value |
|--------|-------|
| Merge base | `dac099a` |
| Upstream commits since base | 1,562 |
| Fork commits since base | 231 |
| Modified upstream files | 17 |
| Lines added in modifications | 596 |
| Lines removed in modifications | 28 |
| Fork-only files | 200 |
| Fork-only lines | 42,771 |
| Total divergent files | 217 |
| Total lines changed | 43,395 |

This snapshot represents the state on January 24, the first day where a fork-divergent commit was the latest on `dev`. The fork had already created 200 new files and modified 17 upstream files. The merge base (`dac099a`) was 5 days old, and there were 1,562 upstream commits since that base — indicating the fork was initially based on a fairly old point in upstream's history.

**Key observation**: The fork immediately started with a large number of new files (200) but relatively few modifications to upstream files (17). This reflects the fork's design philosophy of putting new code in `fork-*` packages and minimizing changes to upstream code.

### Phase 1 Plateau (January 25 – January 31)

For the next seven days, the metrics remain identical because no new fork-divergent commit became the latest on `dev`. The merge base age steadily increased from 6 to 12 days, reflecting how the fork was drifting further from the common ancestor without syncing.

This is the "carried forward" data — the fork was likely still active (work happening on feature branches, planning, etc.) but those changes hadn't landed on `dev` yet.

### Phase 2: Major Growth (February 1, 2026)

| Metric | Value |
|--------|-------|
| Merge base | `dac099a` (same) |
| Fork commits since base | 391 (+160 from phase 1) |
| Modified upstream files | 50 (+33) |
| Fork-only files | 318 (+118) |
| Total divergent files | 368 (+151) |
| Total lines changed | 68,841 (+25,446) |

A significant batch of fork work landed. The number of modified upstream files nearly tripled (17 → 50), fork-only files grew by 118, and total lines changed jumped by 25,000. The merge base was now 13 days old.

**Key observation**: The fork was in a heavy development phase. The ratio of new files to modified files (118 new vs. 33 newly modified) continued to show the fork's discipline of preferring new packages over upstream modifications.

### Phase 2 Plateau (February 2 – February 6)

Again, five days of identical metrics. The merge base age grew from 14 to 18 days — approaching three weeks since the last upstream sync.

### Phase 3: The Big Sync (February 7, 2026)

| Metric | Before (Feb 6) | After (Feb 7) | Change |
|--------|----------------|---------------|--------|
| Merge base | `dac099a` | `8ad5262` | **New base** |
| Upstream commits since base | 1,562 | 122 | **-1,440** |
| Fork commits since base | 391 | 490 | +99 |
| Merge base age | 18 days | 0 days | **Reset** |
| Modified upstream files | 50 | 86 | +36 |
| Fork-only files | 318 | 448 | +130 |
| Total divergent files | 368 | 534 | +166 |
| Total lines changed | 68,841 | 129,072 | +60,231 |

This is the most interesting event in the data. A major upstream sync occurred, pushing the merge base forward from `dac099a` to `8ad5262`. This absorbed 1,440 upstream commits (upstream went from 1,562 ahead to only 122 ahead). The merge base age reset to 0 — the fork was now based on nearly-current upstream code.

Despite syncing, the fork's divergence metrics actually *increased* dramatically:
- Total divergent files jumped from 368 to 534.
- Total lines changed nearly doubled from 68K to 129K.

**Why did divergence increase after syncing?** Because the sync moved the merge base forward, which changes what "divergence" means. Some changes that were previously part of upstream's side of the diff are now on the fork's side. Additionally, the fork had been accumulating unmerged work during the 18-day plateau, and the sync event also included that work landing on `dev`.

The 60,000-line jump in a single day shows the magnitude of combined fork development + rebase/merge activity.

### Phase 4: Continued Sync and Growth (February 8 – 10, 2026)

| Date | Merge Base | Upstream Ahead | Fork Files | Total Lines |
|------|-----------|----------------|------------|-------------|
| Feb 8 | `8ad5262` | 122 | 534 | 129,072 |
| Feb 9 | `19b1222` | 108 | 576 | 133,041 |
| Feb 10 | `1e2f664` | 8 | 586 | 133,615 |

The fork continued syncing aggressively. By February 10, the upstream was only 8 commits ahead — essentially fully caught up. Meanwhile, fork-only files grew from 448 to 481, and modified files from 86 to 105.

---

## Deep Analysis: Where the Divergence Lives

### Modified Upstream Files (105 files)

The 105 files that the fork has modified in the upstream codebase are concentrated in:

| Area | Files Modified | Description |
|------|---------------|-------------|
| `.github/workflows` | 17 | CI/CD customization — the fork has its own sync workflow, divergence tracking, and modified triggers |
| `packages/opencode/src/server/routes` | 5 | Server route modifications — primarily thin shims that import from `fork-auth` |
| `packages/opencode/src/cli/cmd` | 5 | CLI command modifications |
| `packages/web/src/content/docs` | 4 | Documentation content |
| `packages/app/src/context` | 3 | Application context/state |
| `packages/app/src/components` | 3 | UI components |
| `packages/app` (root) | 3 | App config (package.json, etc.) |

The most heavily modified upstream files by line count:

| File | Lines Changed | Added | Removed |
|------|--------------|-------|---------|
| `packages/sdk/openapi.json` | 6,466 | 4,698 | 1,768 |
| `packages/sdk/js/src/v2/gen/types.gen.ts` | 1,102 | 1,026 | 76 |
| `packages/app/src/addons/serialize.ts` | 635 | 1 | 634 |
| `packages/sdk/js/src/v2/gen/sdk.gen.ts` | 563 | 561 | 2 |
| `packages/app/src/components/terminal.tsx` | 447 | 5 | 442 |
| `packages/opencode/src/config/config.ts` | 340 | 156 | 184 |
| `bun.lock` | 319 | 273 | 46 |
| `packages/opencode/src/server/server.ts` | 288 | 201 | 87 |

**Key observation**: The largest modifications are in generated files (`openapi.json`, `types.gen.ts`, `sdk.gen.ts`) which account for ~8,100 of the 12,600 modified lines. These are auto-generated from schema changes and inflate the modification count. The actual hand-written upstream modifications are more modest — config changes, server routes, and UI components.

### Fork-Only Files (481 files)

The 481 files added by the fork are distributed across:

| Package/Area | Files | Lines | Description |
|-------------|-------|-------|-------------|
| `.planning/phases` | 178 | ~15,000 | Phase planning documents (research, plans, verification reports) |
| `packages/fork-ui` | 45 | 6,912 | Fork-specific UI components (login, passkey setup, etc.) |
| `packages/opencode` | 37 | ~8,000 | Tests and new source files added to the core package |
| `packages/app` | 35 | ~5,000 | E2E tests and app additions |
| `packages/opencode-broker` | 33 | ~5,000 | Rust-based message broker (IPC handler, protocol) |
| `packages/fork-tests` | 30 | 41,446 | Fork-specific test suite |
| `packages/fork-auth` | 26 | 7,418 | Authentication system (PAM, broker client, routes) |
| `.planning/debug` | 18 | ~2,500 | Debug session notes |
| `packages/fork-terminal` | 13 | 2,023 | Terminal functionality |
| `docs/upstream-sync` | 10 | ~3,000 | Upstream sync documentation |
| `packages/fork-cli` | 8 | 605 | CLI extensions |
| `packages/fork-provider` | 6 | 325 | Provider handling |
| `packages/fork-config` | 4 | 113 | Configuration |
| `packages/fork-security` | 3 | 38 | Security |

**Key observation**: The `packages/fork-tests` package is by far the largest fork-only package at 41,446 lines. However, this is inflated by a single fixture file (`tool/fixtures/models-api.json` at 33,453 lines). Without this fixture, fork-tests would be ~8,000 lines, putting it closer to `fork-auth` and `fork-ui` in size.

The `.planning` directory accounts for 178 files — over a third of all fork-only files. These are GSD (Get Stuff Done) workflow artifacts: phase research, plans, verification reports, and debug sessions. They represent the project management and planning overhead of the fork.

### File Type Distribution in Fork Additions

| Extension | Count | Percentage |
|-----------|-------|------------|
| `.md` | 223 | 46% |
| `.ts` | 127 | 26% |
| `.tsx` | 55 | 11% |
| `.rs` | 24 | 5% |
| `.json` | 19 | 4% |
| `.txt` | 7 | 1.5% |
| `.html` | 5 | 1% |
| Other | 21 | 4.5% |

**Key observation**: Nearly half of all fork-only files are Markdown documentation. The actual source code additions (TS + TSX + Rust) account for about 43% of files. The presence of 24 Rust files is notable — these are from the `opencode-broker` package, which implements a message broker in Rust. The upstream project is primarily TypeScript, making this Rust addition a significant architectural decision.

---

## Upstream Sync Patterns

The fork has undergone multiple upstream sync events, visible both in the data and in the merge commit history:

1. **Catchup batch syncs** (early fork history): `sync/catchup-001`, `sync/catchup-002`, `sync/catchup-003` — these were the initial efforts to bring the fork up to date with upstream.

2. **Automated `parent-dev` syncs** (February 6–8): A series of merges from `parent-dev` into `sync/upstream-dev-*` branches, happening multiple times per day. These suggest an automated sync process was running frequently.

3. **Manual hotfix sync** (February 10): `Merge remote-tracking branch 'upstream/dev' into sync/catchup-hotfix-20260210` — a direct merge from upstream to catch up to the latest.

The data shows the merge base jumping forward on sync days:
- `dac099a` → `8ad5262` (Feb 7): Absorbed 1,440 upstream commits
- `8ad5262` → `19b1222` (Feb 9): Absorbed 14 more
- `19b1222` → `1e2f664` (Feb 10): Absorbed 100 more, now only 8 commits behind

---

## Current State Summary (February 10, 2026)

| Metric | Value |
|--------|-------|
| **Merge base** | `1e2f664` — "fix(app): back to platform fetch for now" by Adam |
| **Merge base age** | 0 days (synced today) |
| **Upstream commits ahead** | 8 (nearly fully synced) |
| **Fork commits since base** | 527 |
| **Modified upstream files** | 105 (+8,683 / -3,939 lines) |
| **Fork-only files** | 481 (+120,993 lines) |
| **Total divergent files** | 586 |
| **Total lines changed** | 133,615 |

The fork is in excellent sync health — only 8 upstream commits ahead. However, the fork itself has 527 commits with 586 divergent files and 134K lines of changes, representing substantial custom functionality layered on top of upstream.

---

## Interesting Findings and Observations

### 1. The Fork's Discipline Shows in the Data

The ratio of fork-only files (481) to modified upstream files (105) is approximately 4.6:1. This strongly validates the fork's architectural principle of "prefer putting new code in `fork-*` packages" and "minimize modifications to non-fork packages." The vast majority of fork divergence is additive, not modificative.

### 2. Generated Files Dominate Upstream Modifications

Of the ~12,600 lines changed in modified upstream files, roughly 8,100 (~64%) are in auto-generated files (OpenAPI spec, SDK types, SDK client). The fork's actual hand-written modifications to upstream code are closer to 4,500 lines across ~100 files — a much more manageable surface area for merge conflicts.

### 3. Documentation Is a Major Fork Investment

With 223 Markdown files (46% of all fork-only files), the fork has invested heavily in documentation, planning, and process artifacts. This includes upstream sync documentation, phase planning, research notes, and debug session logs. While these don't contribute to runtime divergence, they represent significant intellectual investment in maintaining the fork.

### 4. The Sync "Sawtooth" Pattern

The data shows a repeating pattern: divergence grows steadily during development periods, then the merge base jumps forward during sync events. However, paradoxically, the absolute divergence numbers *increase* after syncs because the rebased merge base changes what's counted as "fork-side" vs "upstream-side" of the diff.

This means tracking "total lines changed" alone doesn't tell the full story — the merge base age and upstream commit count provide essential context about whether the fork is falling behind or staying current.

### 5. The Rust Frontier

The `opencode-broker` package introduces 24 Rust source files and a `Cargo.lock`, representing a new language frontier for the fork. The upstream project is pure TypeScript/JavaScript. This Rust component (a message broker) is a significant architectural addition that cannot be easily synced or merged — it's entirely fork-specific infrastructure.

### 6. Test Investment

The fork has made a substantial investment in testing: `packages/fork-tests` (30 files, 41K lines including fixtures), plus 37 new files in `packages/opencode` (many of which are tests) and 35 in `packages/app` (including E2E tests). This suggests the fork takes testing seriously, likely because maintaining a fork requires confidence that changes don't break upstream functionality.

---

## How to Read Future Data

When new rows are appended to `fork-divergence.csv`, here's how to interpret changes:

- **`merge_base` changes**: An upstream sync happened. The fork rebased onto newer upstream code.
- **`upstream_commits` drops significantly**: A sync absorbed a large batch of upstream commits.
- **`merge_base_age_days` resets to 0**: The merge base is fresh — the fork just synced.
- **`merge_base_age_days` growing steadily**: The fork is drifting behind upstream. Values above 7 suggest it's time to sync.
- **`modified_files` increases**: The fork modified more upstream files. Watch for this growing beyond ~150, which would suggest increasing merge conflict risk.
- **`added_files` increases**: New fork-only files were added. This is expected growth.
- **`total_lines_changed` spikes**: Could be a large feature landing, a sync rebase, or auto-generated file changes.
- **All metrics plateau**: No fork-specific work landed on `dev` that day (metrics are carried forward from the last fork-divergent commit).

---

*This summary was generated on February 10, 2026 by Claude during the initial implementation of the fork divergence tracking system.*
