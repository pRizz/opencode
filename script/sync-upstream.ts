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
const SYNC_LABEL = "sync"
const CONFLICT_LABEL = "sync-conflict"
const SYNC_E2E_FAILURE_LABEL = "sync-e2e-failure"

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
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
  ].join("")
}

function utcHuman(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:00 UTC`
}

function parseGitHubRepo(url: string): string | undefined {
  const match = url.trim().match(/(?:https:\/\/|git@)github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?$/)
  return match?.[1]
}

async function resolveOriginRepo(): Promise<string> {
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
}) {
  const hasLabel = await ensureLabel(
    params.repo,
    params.label,
    params.label === CONFLICT_LABEL ? "B60205" : "D93F0B",
    params.label === CONFLICT_LABEL ? "Upstream sync conflicts" : "Upstream sync e2e failures",
  )

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

// ── Test gate ─────────────────────────────────────────────

async function runTestGate(): Promise<{ passed: boolean; summary: string }> {
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

// ── PR creation helper ────────────────────────────────────

async function createSyncPR(params: {
  repo: string
  branch: string
  mergeBase: string
  behind: number
  ahead: number
  title: string
  body: string
}) {
  const hasSyncLabel = await ensureLabel(params.repo, SYNC_LABEL, "0366D6", "Automated upstream syncs")

  let pr = hasSyncLabel
    ? await $`gh pr create --repo ${params.repo} --base ${DEV_BRANCH} --head ${params.branch} --title ${params.title} --body ${params.body} --label ${SYNC_LABEL}`.nothrow()
    : await $`gh pr create --repo ${params.repo} --base ${DEV_BRANCH} --head ${params.branch} --title ${params.title} --body ${params.body}`.nothrow()

  if (pr.exitCode !== 0 && hasSyncLabel) {
    const stderr = pr.stderr.toString().trim()
    console.warn(`Failed to create labeled sync PR, retrying without label: ${stderr || "unknown error"}`)
    pr = await $`gh pr create --repo ${params.repo} --base ${DEV_BRANCH} --head ${params.branch} --title ${params.title} --body ${params.body}`.nothrow()
  }

  if (pr.exitCode !== 0) {
    console.error("Failed to create PR:", pr.stderr.toString())
    process.exit(1)
  }

  const prUrl = pr.stdout.toString().trim()
  const merge = await $`gh pr merge --repo ${params.repo} --auto --merge ${prUrl}`.nothrow()
  if (merge.exitCode !== 0) {
    console.error("Failed to enable auto-merge:", merge.stderr.toString())
    process.exit(1)
  }

  console.log(`Sync PR created and auto-merge enabled: ${prUrl}`)
}

// ── Phase: merge ──────────────────────────────────────────

async function runMergePhase() {
  await ensureGhToken()
  await ensureCleanTree()
  const repo = await resolveOriginRepo()

  await $`git config user.name "opencode-sync-bot"`
  await $`git config user.email "opencode-sync-bot@users.noreply.github.com"`

  await ensureUpstreamRemote()
  await $`git fetch ${REMOTE_UPSTREAM} --tags`
  await $`git fetch ${REMOTE_ORIGIN} ${DEV_BRANCH}`

  // Avoid ambiguous branch resolution once both origin/dev and upstream/dev exist.
  await $`git checkout -B ${DEV_BRANCH} ${REMOTE_ORIGIN}/${DEV_BRANCH}`

  await $`git branch -f ${PARENT_BRANCH} ${REMOTE_UPSTREAM}/${UPSTREAM_BRANCH}`
  await $`git push ${REMOTE_ORIGIN} ${PARENT_BRANCH} --force`

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
    setOutput("needs_claude", "true")
    setOutput("has_conflicts", "true")
    setOutput("conflicted_files", conflicted)
    setOutput("sync_branch", branch)
    setOutput("merge_base", mergeBase)
    setOutput("behind", String(behind))
    setOutput("ahead", String(ahead))
    console.log(`Merge has conflicts in:\n${conflicted}\nHanding off to Claude Code Action.`)
    return
  }

  // Clean merge — run tests
  const testResult = await runTestGate()
  if (!testResult.passed) {
    // Tests failed on clean merge — hand off to Claude to fix
    setOutput("needs_claude", "true")
    setOutput("has_conflicts", "false")
    setOutput("test_failures", testResult.summary)
    setOutput("sync_branch", branch)
    setOutput("merge_base", mergeBase)
    setOutput("behind", String(behind))
    setOutput("ahead", String(ahead))
    console.log("Clean merge succeeded but tests failed. Handing off to Claude Code Action.")
    return
  }

  // All good — push + create PR
  setOutput("needs_claude", "false")

  await $`git push ${REMOTE_ORIGIN} ${branch}`

  const title = `Sync upstream dev (${utcHuman()})`
  const body = [
    `Automated sync from ${UPSTREAM_REPO}:${UPSTREAM_BRANCH}.`,
    "",
    `Merge base: ${mergeBase}`,
    `Upstream commits behind: ${behind}`,
    `Fork commits ahead: ${ahead}`,
    "",
    "Generated by script/sync-upstream.ts.",
  ].join("\n")

  await createSyncPR({ repo, branch, mergeBase, behind, ahead, title, body })
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
  const repo = await resolveOriginRepo()

  await $`git push ${REMOTE_ORIGIN} ${opts.branch}`

  const title = opts.claudeResolved
    ? `Sync upstream dev — fixed by Claude (${utcHuman()})`
    : `Sync upstream dev (${utcHuman()})`

  const bodyLines = [
    `Automated sync from ${UPSTREAM_REPO}:${UPSTREAM_BRANCH}.`,
    "",
    `Merge base: ${opts.mergeBase}`,
    `Upstream commits behind: ${opts.behind}`,
    `Fork commits ahead: ${opts.ahead}`,
  ]
  if (opts.claudeResolved) {
    bodyLines.push(
      "",
      "**Issues were resolved automatically by Claude Code.**",
      "**Typecheck and e2e tests passed after resolution.**",
      "Please review the changes carefully before merging.",
    )
  }
  bodyLines.push("", "Generated by script/sync-upstream.ts.")
  const body = bodyLines.join("\n")

  await createSyncPR({ repo, branch: opts.branch, mergeBase: opts.mergeBase, behind: opts.behind, ahead: opts.ahead, title, body })
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

  const reason = opts.hadConflicts
    ? "merge conflicts"
    : "typecheck/e2e test failures after clean merge"

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
    "- Push the fix and enable auto-merge once CI is green.",
  ].join("\n")

  const label = opts.hadConflicts ? CONFLICT_LABEL : SYNC_E2E_FAILURE_LABEL
  const created = await createIssueWithOptionalLabel({ repo, title, body, label })
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
