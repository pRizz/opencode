#!/usr/bin/env bun
/**
 * Regenerates the fork-boundary manifest for non-fork divergence.
 * - Computes divergent files from upstream/dev to a target ref.
 * - Classifies each divergent path with boundary metadata.
 * - Writes docs/upstream-sync/fork-boundary-manifest.json for boundary checks.
 */

const UPSTREAM_REMOTE = "upstream"
const UPSTREAM_BRANCH = "dev"
const UPSTREAM_URL = "https://github.com/anomalyco/opencode.git"
const UPSTREAM_REF = `${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`
const OUT_PATH = "docs/upstream-sync/fork-boundary-manifest.json"

type Classification = "adapter" | "fork-owned-moved" | "upstream-candidate" | "exception"

type Entry = {
  classification: Classification
  owner: string
  reason: string
  retirement_condition: string
  allow_fork_imports?: boolean
  max_lines?: number
}

const CODE_ADAPTER_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|rs)$/
const FORK_IMPORT =
  /(?:from\s*["']@opencode-ai\/fork-|import\s*\(\s*["']@opencode-ai\/fork-|require\(\s*["']@opencode-ai\/fork-)/

async function git(...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${code}): ${stderr.trim()}`)
  }
  return stdout.trim()
}

async function gitMaybe(...args: string[]) {
  try {
    return await git(...args)
  } catch {
    return ""
  }
}

async function gitOk(...args: string[]) {
  try {
    await git(...args)
    return true
  } catch {
    return false
  }
}

async function resolveTargetRef() {
  const configured = process.env.FORK_BOUNDARY_TARGET_REF?.trim()
  if (configured) return configured

  const branch = await gitMaybe("symbolic-ref", "--quiet", "--short", "HEAD")
  if (branch) return branch

  return "HEAD"
}

async function ensureUpstream() {
  if (await gitOk("rev-parse", "--verify", UPSTREAM_REF)) return

  const hasRemote = await gitOk("remote", "get-url", UPSTREAM_REMOTE)
  if (!hasRemote) {
    await git("remote", "add", UPSTREAM_REMOTE, UPSTREAM_URL)
  } else {
    const url = await git("remote", "get-url", UPSTREAM_REMOTE)
    if (url !== UPSTREAM_URL) await git("remote", "set-url", UPSTREAM_REMOTE, UPSTREAM_URL)
  }

  await git("fetch", UPSTREAM_REMOTE, UPSTREAM_BRANCH)
}

async function hasMergeBase(refA: string, refB: string) {
  return gitOk("merge-base", refA, refB)
}

async function isShallowRepository() {
  const shallow = await git("rev-parse", "--is-shallow-repository")
  return shallow === "true"
}

async function ensureMergeBase(targetRef: string) {
  let attemptedShallowRecovery = false

  if (await hasMergeBase(UPSTREAM_REF, targetRef)) return

  if (await isShallowRepository()) {
    attemptedShallowRecovery = true
    await git("fetch", "--unshallow", "origin")
    await git("fetch", UPSTREAM_REMOTE, UPSTREAM_BRANCH)
    if (await hasMergeBase(UPSTREAM_REF, targetRef)) return
  }

  throw new Error(
    [
      `Unable to determine a merge base between ${UPSTREAM_REF} and ${targetRef}.`,
      `Shallow recovery attempted: ${attemptedShallowRecovery ? "yes" : "no"}.`,
      "Verify remotes and branch history (for example: ensure the refs are related and fully fetched).",
    ].join(" "),
  )
}

function owner(file: string) {
  if (file.startsWith("packages/")) return file.split("/")[1] ?? "packages"
  if (file.startsWith(".planning/")) return "planning"
  if (file.startsWith(".github/")) return "ci"
  if (file.startsWith("docs/")) return "docs"
  if (file.startsWith("script/")) return "tooling"
  if (file.startsWith(".opencode/")) return "tooling"
  if (file.startsWith(".husky/")) return "ci"
  return "repo"
}

function classify(file: string, text: string): Entry {
  if (file.startsWith("packages/opencode-broker/")) {
    return {
      classification: "exception",
      owner: "opencode-broker",
      reason: "Privileged broker runtime remains an explicit non-fork exception in this cycle.",
      retirement_condition: "Retire when broker runtime has a dedicated fork package boundary.",
      allow_fork_imports: false,
    }
  }

  if (file.startsWith(".planning/")) {
    return {
      classification: "exception",
      owner: owner(file),
      reason: "Planning artifacts are fork-local and intentionally divergent.",
      retirement_condition: "Retire when planning artifact is archived or no longer maintained.",
    }
  }

  if (
    file.startsWith("docs/") ||
    file.startsWith("packages/web/src/content/docs/") ||
    file.includes("/src/i18n/") ||
    file.startsWith("README")
  ) {
    return {
      classification: "exception",
      owner: owner(file),
      reason: "Documentation and localization deltas are tracked but out of strict runtime boundary scope.",
      retirement_condition: "Retire when docs/i18n deltas are synchronized with upstream.",
    }
  }

  if (file.startsWith("packages/") && CODE_ADAPTER_EXT.test(file) && FORK_IMPORT.test(text)) {
    return {
      classification: "adapter",
      owner: owner(file),
      reason: "Thin boundary adapter to fork-owned implementation.",
      retirement_condition: "Retire when equivalent upstream extension point exists or feature is upstreamed.",
      max_lines: 120,
    }
  }

  return {
    classification: "upstream-candidate",
    owner: owner(file),
    reason: "Non-fork divergence tracked for upstream alignment or fork extraction.",
    retirement_condition: "Retire by upstreaming change or moving fork-owned behavior behind adapter boundaries.",
  }
}

await ensureUpstream()
const targetRef = await resolveTargetRef()
await ensureMergeBase(targetRef)
const base = `${UPSTREAM_REF}...${targetRef}`

const files = await git("diff", "--name-only", base)
  .then((x) =>
    x
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .then((x) => x.filter((file) => !file.startsWith("packages/fork-")))
  .then((x) => [...new Set(x)].sort())

const entries: Record<string, Entry> = {}
for (const file of files) {
  const exists = await Bun.file(file).exists()
  const text = exists
    ? await Bun.file(file)
        .text()
        .catch(() => "")
    : ""
  entries[file] = classify(file, text)
}

const out = {
  base,
  generated_at: new Date().toISOString(),
  entries,
}

await Bun.write(OUT_PATH, JSON.stringify(out, null, 2) + "\n")
console.log(`Wrote ${OUT_PATH} with ${files.length} non-fork divergent file entries.`)
