#!/usr/bin/env bun

const BASE = "upstream/dev...dev"
const UPSTREAM_REMOTE = "upstream"
const UPSTREAM_URL = "https://github.com/anomalyco/opencode.git"
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
    if (url !== UPSTREAM_URL) await git("remote", "set-url", UPSTREAM_REMOTE, UPSTREAM_URL)
  }

  await git("fetch", UPSTREAM_REMOTE, "dev")
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

const files = await git("diff", "--name-only", BASE)
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
  base: BASE,
  generated_at: new Date().toISOString(),
  entries,
}

await Bun.write(OUT_PATH, JSON.stringify(out, null, 2) + "\n")
console.log(`Wrote ${OUT_PATH} with ${files.length} non-fork divergent file entries.`)
