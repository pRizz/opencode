#!/usr/bin/env bun
/**
 * Validates fork-boundary policy for non-fork divergence against upstream.
 * - Computes divergent files from upstream/dev to a target ref.
 * - Ensures every divergent non-fork path is tracked in the boundary manifest.
 * - Enforces adapter/import classification rules.
 * - Optionally auto-syncs manifest drift in local autofix mode.
 */

const UPSTREAM_REMOTE = "upstream"
const UPSTREAM_BRANCH = "dev"
const UPSTREAM_URL = "https://github.com/anomalyco/opencode.git"
const UPSTREAM_REF = `${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`
const MANIFEST_PATH = "docs/upstream-sync/fork-boundary-manifest.json"
const SYNC_SCRIPT_PATH = "./script/sync-fork-boundary-manifest.ts"
const ADAPTER_MAX_LINES = 120

const CLASSIFICATIONS = new Set(["adapter", "fork-owned-moved", "upstream-candidate", "exception"])
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|rs)$/
const FORK_IMPORT =
  /(?:from\s*["']@opencode-ai\/fork-|import\s*\(\s*["']@opencode-ai\/fork-|require\(\s*["']@opencode-ai\/fork-)/

type Classification = "adapter" | "fork-owned-moved" | "upstream-candidate" | "exception"

type Entry = {
  classification: Classification
  owner: string
  reason: string
  retirement_condition: string
  allow_fork_imports?: boolean
  max_lines?: number
}

type Manifest = {
  base: string
  generated_at: string
  entries: Record<string, Entry>
}

type Evaluation = {
  base: string
  divergent: string[]
  counts: Record<string, number>
  driftIssues: string[]
  validationIssues: string[]
}

const targetRef = await resolveTargetRef()
const autofix = process.env.FORK_BOUNDARY_AUTOFIX === "1"

async function gitResult(...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, stdout: stdout.trim(), stderr: stderr.trim() }
}

async function git(...args: string[]) {
  const res = await gitResult(...args)
  if (res.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${res.code}): ${res.stderr}`)
  }
  return res.stdout
}

async function gitMaybe(...args: string[]) {
  const res = await gitResult(...args)
  if (res.code !== 0) return ""
  return res.stdout
}

async function gitOk(...args: string[]) {
  const res = await gitResult(...args)
  return res.code === 0
}

async function resolveTargetRef() {
  const configured = process.env.FORK_BOUNDARY_TARGET_REF?.trim()
  if (configured) return configured

  const branch = await gitMaybe("symbolic-ref", "--quiet", "--short", "HEAD")
  if (branch) return branch

  return "HEAD"
}

async function syncManifest() {
  const proc = Bun.spawn(["bun", SYNC_SCRIPT_PATH], {
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      FORK_BOUNDARY_TARGET_REF: targetRef,
    },
  })
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`${SYNC_SCRIPT_PATH} failed (${code})`)
  }
}

async function ensureUpstream() {
  if (await gitOk("rev-parse", "--verify", UPSTREAM_REF)) return

  const hasRemote = await gitOk("remote", "get-url", UPSTREAM_REMOTE)
  if (!hasRemote) {
    await git("remote", "add", UPSTREAM_REMOTE, UPSTREAM_URL)
  } else {
    const url = await git("remote", "get-url", UPSTREAM_REMOTE)
    if (url !== UPSTREAM_URL) {
      await git("remote", "set-url", UPSTREAM_REMOTE, UPSTREAM_URL)
    }
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

async function ensureMergeBase() {
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

function isNonForkPath(file: string) {
  return !file.startsWith("packages/fork-")
}

function isCodePath(file: string) {
  return CODE_EXT.test(file)
}

function formatList(title: string, list: string[]) {
  if (list.length === 0) return ""
  return [title, ...list.map((x) => `  - ${x}`)].join("\n")
}

function printFailures(...issues: string[]) {
  console.error("Fork boundary check failed.\n")
  for (const issue of issues) {
    console.error(issue + "\n")
  }
}

async function evaluate(): Promise<Evaluation> {
  const base = `${UPSTREAM_REF}...${targetRef}`
  const manifest = (await Bun.file(MANIFEST_PATH).json()) as Manifest
  if (!manifest || typeof manifest !== "object" || !manifest.entries) {
    throw new Error(`Invalid manifest: ${MANIFEST_PATH}`)
  }

  const divergent = await git("diff", "--name-only", base)
    .then((x) =>
      x
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .then((x) => x.filter(isNonForkPath))
    .then((x) => [...new Set(x)].sort())

  const entries = manifest.entries
  const entryPaths = Object.keys(entries).sort()

  const missing = divergent.filter((file) => !entries[file])
  const stale = entryPaths.filter((file) => !divergent.includes(file))

  const driftIssues: string[] = []
  if (missing.length) {
    driftIssues.push(formatList("Missing manifest entries:", missing))
  }
  if (stale.length) {
    driftIssues.push(formatList("Stale manifest entries:", stale))
  }

  const validationIssues: string[] = []
  const counts: Record<string, number> = {}

  for (const file of divergent) {
    const entry = entries[file]
    if (!entry) continue

    if (!CLASSIFICATIONS.has(entry.classification)) {
      validationIssues.push(`Invalid classification for ${file}: ${entry.classification}`)
      continue
    }

    if (!entry.owner || !entry.reason || !entry.retirement_condition) {
      validationIssues.push(`Incomplete metadata for ${file} (owner/reason/retirement_condition required)`)
    }

    counts[entry.classification] = (counts[entry.classification] ?? 0) + 1

    const exists = await Bun.file(file).exists()
    if (!exists) continue

    const text = await Bun.file(file)
      .text()
      .catch(() => "")
    const hasForkImport = FORK_IMPORT.test(text)

    if (entry.classification === "adapter") {
      const max = entry.max_lines ?? ADAPTER_MAX_LINES
      const lines = text.split(/\r?\n/).length
      if (lines > max) {
        validationIssues.push(`Adapter ${file} exceeds max lines (${lines} > ${max})`)
      }
      if (!hasForkImport) {
        validationIssues.push(`Adapter ${file} does not directly reference @opencode-ai/fork-`)
      }
    }

    if (isCodePath(file) && hasForkImport) {
      const allowed =
        entry.classification === "adapter" || (entry.classification === "exception" && entry.allow_fork_imports)
      if (!allowed) {
        validationIssues.push(
          `${file} directly references @opencode-ai/fork- but is classified as ${entry.classification} (not allowlisted)`,
        )
      }
    }
  }

  return { base, divergent, counts, driftIssues, validationIssues }
}

await ensureUpstream()
await ensureMergeBase()

let result = await evaluate()

if (autofix && result.driftIssues.length > 0 && result.validationIssues.length === 0) {
  console.warn("fork:boundary:check: detected manifest drift; running fork:boundary:sync and re-checking...")
  await syncManifest()
  result = await evaluate()
}

const issues = [...result.driftIssues, ...result.validationIssues]
if (issues.length > 0) {
  printFailures(...issues)
  process.exit(1)
}

console.log(
  `Fork boundary check passed for ${result.divergent.length} non-fork divergent file(s) against ${result.base}.`,
)
console.log(
  `Classification counts: ${Object.entries(result.counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${key}=${val}`)
    .join(", ")}`,
)
