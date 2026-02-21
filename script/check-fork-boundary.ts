#!/usr/bin/env bun

const BASE = "upstream/dev...dev"
const UPSTREAM_REMOTE = "upstream"
const UPSTREAM_URL = "https://github.com/anomalyco/opencode.git"
const MANIFEST_PATH = "docs/upstream-sync/fork-boundary-manifest.json"
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

async function gitOk(...args: string[]) {
  try {
    await git(...args)
    return true
  } catch {
    return false
  }
}

async function ensureUpstream() {
  if (await gitOk("rev-parse", "--verify", `${UPSTREAM_REMOTE}/dev`)) return

  const hasRemote = await gitOk("remote", "get-url", UPSTREAM_REMOTE)
  if (!hasRemote) {
    await git("remote", "add", UPSTREAM_REMOTE, UPSTREAM_URL)
  } else {
    const url = await git("remote", "get-url", UPSTREAM_REMOTE)
    if (url !== UPSTREAM_URL) {
      await git("remote", "set-url", UPSTREAM_REMOTE, UPSTREAM_URL)
    }
  }

  await git("fetch", UPSTREAM_REMOTE, "dev")
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

const manifest = (await Bun.file(MANIFEST_PATH).json()) as Manifest
if (!manifest || typeof manifest !== "object" || !manifest.entries) {
  throw new Error(`Invalid manifest: ${MANIFEST_PATH}`)
}

await ensureUpstream()

const divergent = await git("diff", "--name-only", BASE)
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

const issues: string[] = []

if (missing.length) {
  issues.push(formatList("Missing manifest entries:", missing))
}
if (stale.length) {
  issues.push(formatList("Stale manifest entries:", stale))
}

const counts: Record<string, number> = {}

for (const file of divergent) {
  const entry = entries[file]
  if (!entry) continue

  if (!CLASSIFICATIONS.has(entry.classification)) {
    issues.push(`Invalid classification for ${file}: ${entry.classification}`)
    continue
  }

  if (!entry.owner || !entry.reason || !entry.retirement_condition) {
    issues.push(`Incomplete metadata for ${file} (owner/reason/retirement_condition required)`)
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
      issues.push(`Adapter ${file} exceeds max lines (${lines} > ${max})`)
    }
    if (!hasForkImport) {
      issues.push(`Adapter ${file} does not directly reference @opencode-ai/fork-`)
    }
  }

  if (isCodePath(file) && hasForkImport) {
    const allowed =
      entry.classification === "adapter" || (entry.classification === "exception" && entry.allow_fork_imports)
    if (!allowed) {
      issues.push(
        `${file} directly references @opencode-ai/fork- but is classified as ${entry.classification} (not allowlisted)`,
      )
    }
  }
}

if (issues.length) {
  console.error("Fork boundary check failed.\n")
  for (const issue of issues) console.error(issue + "\n")
  process.exit(1)
}

console.log(`Fork boundary check passed for ${divergent.length} non-fork divergent file(s) against ${BASE}.`)
console.log(
  `Classification counts: ${Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${key}=${val}`)
    .join(", ")}`,
)
