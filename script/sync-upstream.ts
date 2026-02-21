#!/usr/bin/env bun

import { $ } from "bun"
import { appendFileSync } from "node:fs"
import path from "node:path"

const UPSTREAM_REPO = "anomalyco/opencode"
const UPSTREAM_BRANCH = "dev"
const DEV_BRANCH = "dev"
const PARENT_BRANCH = "parent-dev"
const REMOTE_UPSTREAM = "upstream"
const REMOTE_ORIGIN = "origin"
const CONFLICT_LABEL = "sync-conflict"
const SYNC_E2E_FAILURE_LABEL = "sync-e2e-failure"
const SYNC_PUSH_FAILURE_LABEL = "sync-push-failure"

// ── CLI argument helpers ──────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] : undefined
}

function requireArg(args: string[], flag: string): string {
  const value = getArg(args, flag)
  if (!value) throw new Error(`Missing required argument: ${flag}`)
  return value
}

// ── GitHub Actions output helper ──────────────────────────

function setOutput(key: string, value: string) {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  if (value.includes("\n")) {
    appendFileSync(file, `${key}<<EOF\n${value}\nEOF\n`)
  } else {
    appendFileSync(file, `${key}=${value}\n`)
  }
}

// ── Utility functions ─────────────────────────────────────

function utcStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate()), pad(date.getUTCHours())].join("")
}

function utcHuman(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:00 UTC`
}

function parseGitHubRepo(url: string): string | undefined {
  // Handles HTTPS (with optional user:token@ credentials), SSH, and git@ URLs
  const match = url.trim().match(/(?:https:\/\/(?:[^@]+@)?|git@)github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/)
  return match?.[1]
}

async function resolveOriginRepo(): Promise<string> {
  // Prefer GH_REPO env var (set by workflow), fall back to parsing git remote
  const envRepo = process.env.GH_REPO
  if (envRepo) return envRepo

  const remote = (await $`git remote get-url ${REMOTE_ORIGIN}`.text()).trim()
  const repo = parseGitHubRepo(remote)
  if (!repo) {
    throw new Error(`Unable to resolve GitHub repo from origin URL: ${remote}`)
  }
  return repo
}

async function ensureLabel(repo: string, name: string, color: string, description: string): Promise<boolean> {
  const result =
    await $`gh label create ${name} --repo ${repo} --color ${color} --description ${description} --force`.nothrow()
  if (result.exitCode === 0) return true
  const stderr = result.stderr.toString().trim()
  console.warn(`Unable to ensure label "${name}" on ${repo}: ${stderr || "unknown error"}`)
  return false
}

function tailLog(text: string, limit = 12_000): string {
  if (text.length <= limit) return text
  return `...[truncated, showing last ${limit} chars]\n${text.slice(-limit)}`
}

async function createIssueWithOptionalLabel(params: {
  repo: string
  title: string
  body: string
  label: string
  color: string
  description: string
}) {
  const hasLabel = await ensureLabel(params.repo, params.label, params.color, params.description)

  let issue = hasLabel
    ? await $`gh issue create --repo ${params.repo} --title ${params.title} --body ${params.body} --label ${params.label}`.nothrow()
    : await $`gh issue create --repo ${params.repo} --title ${params.title} --body ${params.body}`.nothrow()

  if (issue.exitCode !== 0 && hasLabel) {
    const stderr = issue.stderr.toString().trim()
    console.warn(`Failed to create labeled issue, retrying without label: ${stderr || "unknown error"}`)
    issue = await $`gh issue create --repo ${params.repo} --title ${params.title} --body ${params.body}`.nothrow()
  }

  if (issue.exitCode !== 0) {
    console.error("Failed to create issue:", issue.stderr.toString().trim())
    return false
  }
  return true
}

async function branchExists(branch: string): Promise<boolean> {
  const result = await $`git ls-remote --heads ${REMOTE_ORIGIN} ${branch}`.text()
  return result.trim().length > 0
}

async function ensureGhToken() {
  if (!process.env.GH_TOKEN && !process.env.UPSTREAM_SYNC_TOKEN) {
    throw new Error("Missing GH_TOKEN or UPSTREAM_SYNC_TOKEN for GitHub CLI auth.")
  }
}

async function ensureCleanTree() {
  const status = await $`git status --porcelain`.text()
  if (status.trim().length > 0) {
    throw new Error("Working tree is not clean. Aborting sync.")
  }
}

async function ensureUpstreamRemote() {
  const upstreamUrl = `https://github.com/${UPSTREAM_REPO}.git`
  const current = await $`git remote get-url ${REMOTE_UPSTREAM}`.nothrow()
  if (current.exitCode !== 0) {
    await $`git remote add ${REMOTE_UPSTREAM} ${upstreamUrl}`
    return
  }
  const existing = current.stdout.toString().trim()
  if (existing !== upstreamUrl) {
    await $`git remote set-url ${REMOTE_UPSTREAM} ${upstreamUrl}`
  }
}

async function ensureOriginAuth() {
  const token = process.env.UPSTREAM_SYNC_TOKEN || process.env.GH_TOKEN
  if (!token) return

  const repo = await resolveOriginRepo()
  const authedUrl = `https://x-access-token:${token}@github.com/${repo}.git`
  await $`git remote set-url ${REMOTE_ORIGIN} ${authedUrl}`
}

// Upstream occasionally retargets existing tag names. Reset local tags first so
// sync fetches don't fail with "would clobber existing tag" errors.
async function resetLocalTagsFromUpstream() {
  const list = (await $`git tag --list`.text()).trim()
  const tags = list.length === 0 ? [] : list.split("\n")

  if (tags.length === 0) {
    console.log("No local tags to delete before sync.")
  }
  if (tags.length > 0) {
    console.log(`Deleting ${tags.length} local tag(s) before sync...`)
  }
  for (let i = 0; i < tags.length; i += 200) {
    await $`git tag -d ${tags.slice(i, i + 200)}`
  }

  console.log("Fetching upstream tags (forced)...")
  await $`git fetch ${REMOTE_UPSTREAM} --tags --force`
}

// ── Test gate ─────────────────────────────────────────────

async function runTestGate(): Promise<{ passed: boolean; summary: string }> {
  // Re-run bun install after merge since the lockfile may have changed
  // (setup-bun ran install with the pre-merge lockfile).
  console.log("Installing dependencies (post-merge)...")
  const deps = await $`bun install`.nothrow()
  if (deps.exitCode !== 0) {
    const log = `${deps.stdout.toString()}\n${deps.stderr.toString()}`
    return { passed: false, summary: `bun install failed:\n${tailLog(log, 4000)}` }
  }
  console.log("Dependencies installed.")

  console.log("Running AGENTS/CLAUDE parity check...")
  const rulesParity = await $`bun run rules:parity:check`.nothrow()
  if (rulesParity.exitCode !== 0) {
    const log = `${rulesParity.stdout.toString()}\n${rulesParity.stderr.toString()}`
    return { passed: false, summary: `rules parity check failed:\n${tailLog(log, 4000)}` }
  }
  console.log("Rules parity check passed.")

  console.log("Running fork boundary check...")
  const forkBoundary = await $`bun run fork:boundary:check`.nothrow()
  if (forkBoundary.exitCode !== 0) {
    const log = `${forkBoundary.stdout.toString()}\n${forkBoundary.stderr.toString()}`
    return { passed: false, summary: `fork boundary check failed:\n${tailLog(log, 4000)}` }
  }
  console.log("Fork boundary check passed.")

  const lockfiles = (await $`git ls-files -m -- ':(glob)**/bun.lock'`.text()).trim()
  if (lockfiles.length > 0) {
    console.log(`bun.lock updates detected after bun install:\n${lockfiles}`)
    await $`git add -- ':(glob)**/bun.lock'`
    await $`git commit -m "chore(sync): refresh bun lockfiles after upstream sync"`
    console.log("Committed bun.lock updates.")
  } else {
    console.log("No bun.lock updates detected after bun install.")
  }

  console.log("Running SDK generation...")
  const sdkGen = await $`bun ./packages/sdk/js/script/build.ts`.nothrow()
  if (sdkGen.exitCode !== 0) {
    const log = `${sdkGen.stdout.toString()}\n${sdkGen.stderr.toString()}`
    return { passed: false, summary: `SDK generation failed:\n${tailLog(log, 4000)}` }
  }
  console.log("SDK generation passed.")

  console.log("Running SDK generated parity check...")
  const sdkParity = await $`bun run sdk:parity:check`.nothrow()
  if (sdkParity.exitCode !== 0) {
    const log = `${sdkParity.stdout.toString()}\n${sdkParity.stderr.toString()}`
    return { passed: false, summary: `SDK parity check failed:\n${tailLog(log, 4000)}` }
  }
  console.log("SDK generated parity check passed.")

  // Stage any SDK changes from generation
  const sdkStatus = (await $`git status --porcelain packages/sdk/js`.text()).trim()
  if (sdkStatus.length > 0) {
    console.log("SDK generation produced changes, staging them...")
    await $`git add packages/sdk/js`
    await $`git commit -m "chore: regenerate SDK types after upstream sync"`
  }

  console.log("Running typecheck...")
  const typecheck = await $`bun turbo typecheck`.nothrow()
  if (typecheck.exitCode !== 0) {
    const log = `${typecheck.stdout.toString()}\n${typecheck.stderr.toString()}`
    return { passed: false, summary: `Typecheck failed:\n${tailLog(log, 4000)}` }
  }
  console.log("Typecheck passed.")

  console.log("Installing Playwright...")
  const install = await $`bunx playwright install --with-deps`.cwd("packages/app").nothrow()
  if (install.exitCode !== 0) {
    const log = `${install.stdout.toString()}\n${install.stderr.toString()}`
    return { passed: false, summary: `Playwright install failed:\n${tailLog(log, 4000)}` }
  }

  console.log("Running e2e tests...")
  const modelsPath = path.resolve("packages/opencode/test/tool/fixtures/models-api.json")
  const test = await $`bun run test:e2e:local -- --workers=2`
    .cwd("packages/app")
    .env({
      ...process.env,
      OPENCODE_DISABLE_MODELS_FETCH: "true",
      OPENCODE_MODELS_PATH: modelsPath,
    })
    .nothrow()

  if (test.exitCode !== 0) {
    const log = `${test.stdout.toString()}\n${test.stderr.toString()}`
    return { passed: false, summary: `E2e tests failed:\n${tailLog(log, 4000)}` }
  }

  console.log("All tests passed.")
  return { passed: true, summary: "" }
}

// ── Finalize helpers ──────────────────────────────────────

function isNonFastForward(text: string) {
  const log = text.toLowerCase()
  return log.includes("non-fast-forward") || log.includes("[rejected]") || log.includes("fetch first")
}

async function pushBackupBranch(branch: string) {
  // Disable husky pre-push hook — claude-code-action may override the bun
  // version, causing the hook's version check to fail in CI.
  const result = await $`git push ${REMOTE_ORIGIN} HEAD:${branch}`.env({ HUSKY: "0" }).nothrow()
  if (result.exitCode === 0) {
    return `Backup branch pushed: ${branch}`
  }
  const log = `${result.stdout.toString()}\n${result.stderr.toString()}`
  return `Backup branch push failed:\n${tailLog(log, 3000)}`
}

async function createPushFailureIssue(params: {
  repo: string
  branch: string
  mergeBase: string
  behind: number
  ahead: number
  stage: "merge" | "push"
  log: string
  backup: string
  claudeResolved: boolean
}) {
  const title = `Upstream sync — unable to push to dev (${utcHuman()})`
  const body = [
    "Automated upstream sync passed tests but failed in post-resolve finalization.",
    "",
    `Failure stage: ${params.stage}`,
    `Branch: ${params.branch}`,
    `Merge base: ${params.mergeBase}`,
    `Upstream commits behind: ${params.behind}`,
    `Fork commits ahead: ${params.ahead}`,
    `Claude resolved conflicts/tests earlier: ${params.claudeResolved ? "yes" : "no"}`,
    params.backup,
    "",
    "Git output tail:",
    "```text",
    tailLog(params.log, 4000),
    "```",
    "",
    "Next steps:",
    "- Inspect the backup branch and resolve any remaining merge/push blockers.",
    "- Re-run sync-upstream after branch policy or conflicts are addressed.",
  ].join("\n")

  return createIssueWithOptionalLabel({
    repo: params.repo,
    title,
    body,
    label: SYNC_PUSH_FAILURE_LABEL,
    color: "B60205",
    description: "Upstream sync direct-push failures",
  })
}

// ── Phase: merge ──────────────────────────────────────────

async function runMergePhase() {
  await ensureGhToken()
  await ensureCleanTree()
  await ensureOriginAuth()

  await $`git config user.name "opencode-sync-bot"`
  await $`git config user.email "opencode-sync-bot@users.noreply.github.com"`

  await ensureUpstreamRemote()
  await resetLocalTagsFromUpstream()
  // Branch sync does not need origin tags; keep tag state sourced from upstream.
  await $`git fetch --no-tags ${REMOTE_ORIGIN} ${DEV_BRANCH}`

  // Avoid ambiguous branch resolution once both origin/dev and upstream/dev exist.
  await $`git checkout -B ${DEV_BRANCH} ${REMOTE_ORIGIN}/${DEV_BRANCH}`

  await $`git branch -f ${PARENT_BRANCH} ${REMOTE_UPSTREAM}/${UPSTREAM_BRANCH}`
  // Disable husky pre-push hook — not needed for CI mirror pushes.
  await $`git push ${REMOTE_ORIGIN} ${PARENT_BRANCH} --force`.env({ HUSKY: "0" })

  const mergeBase = (await $`git merge-base ${PARENT_BRANCH} ${DEV_BRANCH}`.text()).trim()
  const counts = (await $`git rev-list --left-right --count ${PARENT_BRANCH}...${DEV_BRANCH}`.text())
    .trim()
    .split(/\s+/)
    .map((value) => Number(value))

  const behind = counts[0] ?? 0
  const ahead = counts[1] ?? 0

  if (behind === 0) {
    console.log("Upstream is already merged. Nothing to sync.")
    return
  }

  const baseBranch = `sync/upstream-dev-${utcStamp()}`
  let branch = baseBranch
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    if (!(await branchExists(branch))) break
    branch = `${baseBranch}-${attempt}`
  }

  await $`git checkout -b ${branch}`
  const mergeResult = await $`git merge --no-edit ${PARENT_BRANCH}`.nothrow()

  if (mergeResult.exitCode !== 0) {
    // Conflict — leave markers in place for Claude to resolve
    const conflicted = (await $`git diff --name-only --diff-filter=U`.text()).trim()
    if (!conflicted) {
      throw new Error("Merge failed but no conflicted files detected")
    }
    setOutput("has_conflicts", "true")
    setOutput("conflicted_files", conflicted)
    console.log(`Merge has conflicts in:\n${conflicted}\nHanding off to Claude Code Action.`)
  } else {
    setOutput("has_conflicts", "false")
    console.log("Clean merge succeeded. Proceeding to test phase.")
  }

  setOutput("sync_branch", branch)
  setOutput("merge_base", mergeBase)
  setOutput("behind", String(behind))
  setOutput("ahead", String(ahead))
}

// ── Phase: test ───────────────────────────────────────────

async function runTestPhase() {
  const result = await runTestGate()
  setOutput("tests_passed", result.passed ? "true" : "false")
  if (!result.passed) {
    setOutput("test_failures", result.summary)
    console.log(`Tests failed:\n${result.summary}`)
  } else {
    console.log("All tests passed.")
  }
}

// ── Phase: post-resolve ───────────────────────────────────

async function runPostResolvePhase(opts: {
  branch: string
  mergeBase: string
  behind: number
  ahead: number
  claudeResolved: boolean
}) {
  await ensureGhToken()
  await ensureOriginAuth()
  const repo = await resolveOriginRepo()
  await $`git checkout ${opts.branch}`

  let stage: "merge" | "push" = "push"
  let log = ""
  for (let i = 1; i <= 2; i += 1) {
    // Avoid reintroducing origin tag conflicts after upstream tag reset.
    await $`git fetch --no-tags ${REMOTE_ORIGIN} ${DEV_BRANCH}`
    // Merge latest dev to avoid replaying the entire sync history with rebase.
    const merge = await $`git merge --no-edit ${REMOTE_ORIGIN}/${DEV_BRANCH}`.nothrow()
    if (merge.exitCode !== 0) {
      stage = "merge"
      const abort = await $`git merge --abort`.nothrow()
      log = `${merge.stdout.toString()}\n${merge.stderr.toString()}`
      if (abort.exitCode !== 0) {
        log = `${log}\n\nMerge abort failed:\n${abort.stdout.toString()}\n${abort.stderr.toString()}`
      }
      break
    }

    // Disable husky pre-push hook — tests already passed in the test gate,
    // and claude-code-action may have overridden the bun version.
    const push = await $`git push ${REMOTE_ORIGIN} HEAD:${DEV_BRANCH}`.env({ HUSKY: "0" }).nothrow()
    log = `${push.stdout.toString()}\n${push.stderr.toString()}`
    if (push.exitCode === 0) {
      console.log("Sync pushed directly to dev.")
      return
    }

    if (i === 1 && isNonFastForward(log)) {
      console.warn("Push rejected as non-fast-forward. Refetching and retrying once.")
      continue
    }
    stage = "push"
    break
  }

  const backup = await pushBackupBranch(opts.branch)
  const created = await createPushFailureIssue({
    repo,
    branch: opts.branch,
    mergeBase: opts.mergeBase,
    behind: opts.behind,
    ahead: opts.ahead,
    stage,
    log,
    backup,
    claudeResolved: opts.claudeResolved,
  })
  if (!created) {
    throw new Error(`Failed to create issue for post-resolve ${stage} failure.`)
  }
  throw new Error(`Post-resolve ${stage} failed. ${backup}`)
}

// ── Phase: create-issue ───────────────────────────────────

async function runCreateIssue(opts: {
  branch: string
  mergeBase: string
  behind: number
  ahead: number
  hadConflicts: boolean
}) {
  await ensureGhToken()
  const repo = await resolveOriginRepo()

  const reason = opts.hadConflicts ? "merge conflicts" : "typecheck/e2e test failures after clean merge"

  const title = `Upstream sync — Claude unable to fix ${reason} (${utcHuman()})`
  const body = [
    `Automated upstream sync failed due to ${reason}.`,
    "Claude Code attempted to fix the issues but was unable to get typecheck and e2e tests passing.",
    "",
    `Branch: ${opts.branch}`,
    `Merge base: ${opts.mergeBase}`,
    `Upstream commits behind: ${opts.behind}`,
    `Fork commits ahead: ${opts.ahead}`,
    "",
    "Next steps:",
    "- Checkout the branch and resolve issues manually.",
    "- Consult docs/upstream-sync.md for known conflict notes.",
    "- Push the fix once CI is green.",
  ].join("\n")

  const label = opts.hadConflicts ? CONFLICT_LABEL : SYNC_E2E_FAILURE_LABEL
  const created = await createIssueWithOptionalLabel({
    repo,
    title,
    body,
    label,
    color: opts.hadConflicts ? "B60205" : "D93F0B",
    description: opts.hadConflicts ? "Upstream sync conflicts" : "Upstream sync e2e failures",
  })
  if (!created) {
    throw new Error(`Failed to create issue for ${reason}.`)
  }
}

// ── Main entry point ──────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const phase = getArg(args, "--phase") ?? "merge"

  switch (phase) {
    case "merge":
      await runMergePhase()
      break
    case "test":
      await runTestPhase()
      break
    case "post-resolve":
      await runPostResolvePhase({
        branch: requireArg(args, "--branch"),
        mergeBase: requireArg(args, "--merge-base"),
        behind: Number(requireArg(args, "--behind")),
        ahead: Number(requireArg(args, "--ahead")),
        claudeResolved: getArg(args, "--claude-resolved") === "true",
      })
      break
    case "create-issue":
      await runCreateIssue({
        branch: requireArg(args, "--branch"),
        mergeBase: requireArg(args, "--merge-base"),
        behind: Number(requireArg(args, "--behind")),
        ahead: Number(requireArg(args, "--ahead")),
        hadConflicts: getArg(args, "--had-conflicts") === "true",
      })
      break
    default:
      throw new Error(`Unknown phase: ${phase}`)
  }
}

main().catch((err) => {
  console.error("Sync failed:", err.message)
  process.exit(1)
})
