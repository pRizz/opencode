#!/usr/bin/env bun

async function git(...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const out = (await new Response(proc.stdout).text()).trim()
  const err = (await new Response(proc.stderr).text()).trim()
  const code = await proc.exited
  return { code, out, err }
}

const worktree = await git("rev-parse", "--is-inside-work-tree")
if (worktree.code !== 0 || worktree.out !== "true") {
  console.log("git-tag-bootstrap: not in a git worktree, skipping.")
  process.exit(0)
}

const prune = await git("config", "--local", "fetch.prune", "true")
if (prune.code !== 0) {
  console.error(`git-tag-bootstrap: failed to set fetch.prune=true: ${prune.err}`)
  process.exit(prune.code)
}

const pruneTags = await git("config", "--local", "fetch.pruneTags", "true")
if (pruneTags.code !== 0) {
  console.error(`git-tag-bootstrap: failed to set fetch.pruneTags=true: ${pruneTags.err}`)
  process.exit(pruneTags.code)
}

const remotes = await git("remote")
if (remotes.code !== 0) {
  console.error(`git-tag-bootstrap: failed to list remotes: ${remotes.err}`)
  process.exit(remotes.code)
}

const list = remotes.out.length === 0 ? [] : remotes.out.split("\n").filter(Boolean)
for (const name of list) {
  const set = await git("config", "--local", `remote.${name}.tagOpt`, "--no-tags")
  if (set.code !== 0) {
    console.error(`git-tag-bootstrap: failed to set remote.${name}.tagOpt=--no-tags: ${set.err}`)
    process.exit(set.code)
  }
}

const names = list.length === 0 ? "(none)" : list.join(", ")
console.log(`git-tag-bootstrap: configured fetch prune + pruneTags; remotes tagOpt=--no-tags for ${names}`)
