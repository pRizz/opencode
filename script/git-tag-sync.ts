#!/usr/bin/env bun

async function git(...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const out = (await new Response(proc.stdout).text()).trim()
  const err = (await new Response(proc.stderr).text()).trim()
  const code = await proc.exited
  return { code, out, err }
}

function normalize(url: string) {
  const val = url.trim()
  if (val.startsWith("git@")) {
    const rest = val.slice(4).replace(":", "/")
    return rest.endsWith(".git") ? rest.slice(0, -4) : rest
  }
  if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("ssh://")) {
    const u = new URL(val)
    const path = u.pathname.endsWith(".git") ? u.pathname.slice(0, -4) : u.pathname
    return `${u.host}${path}`
  }
  return val.endsWith(".git") ? val.slice(0, -4) : val
}

async function remotes() {
  const list = await git("remote")
  if (list.code !== 0) return []
  const names = list.out.length === 0 ? [] : list.out.split("\n").filter(Boolean)
  const all = await Promise.all(
    names.map(async (name) => {
      const url = await git("remote", "get-url", name)
      if (url.code !== 0) return undefined
      return { name, url: normalize(url.out) }
    }),
  )
  return all.filter((item): item is { name: string; url: string } => Boolean(item))
}

async function fromFetchHead(all: { name: string; url: string }[]) {
  const path = await git("rev-parse", "--git-path", "FETCH_HEAD")
  if (path.code !== 0 || path.out.length === 0) return

  const file = Bun.file(path.out)
  if (!(await file.exists())) return

  const text = (await file.text()).trim()
  if (text.length === 0) return

  const lines = text.split("\n")
  for (const line of lines) {
    const match = line.match(/\bof\s+(.+)$/)
    if (!match) continue
    const url = normalize(match[1])
    const remote = all.find((item) => item.url === url)
    if (remote) return remote.name
  }
}

async function fromUpstream(all: { name: string; url: string }[]) {
  const up = await git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
  if (up.code !== 0 || up.out.length === 0) return

  const i = up.out.indexOf("/")
  if (i <= 0) return
  const name = up.out.slice(0, i)
  const has = all.some((item) => item.name === name)
  if (!has) return
  return name
}

async function chooseRemote() {
  const all = await remotes()
  if (all.length === 0) return

  const fetch = await fromFetchHead(all)
  if (fetch) return fetch

  const up = await fromUpstream(all)
  if (up) return up

  const origin = all.find((item) => item.name === "origin")
  if (origin) return origin.name
}

const name = await chooseRemote()
if (!name) {
  console.log("git-tag-sync: no remote resolved, skipping.")
  process.exit(0)
}

console.log(`git-tag-sync: mirroring tags from ${name}`)
const sync = await git("fetch", name, "--prune", "--prune-tags", "+refs/tags/*:refs/tags/*")
if (sync.code !== 0) {
  console.error(`git-tag-sync: failed to mirror tags from ${name}: ${sync.err}`)
  process.exit(sync.code)
}

if (sync.out.length > 0) console.log(sync.out)
console.log(`git-tag-sync: tags now mirror ${name}`)
