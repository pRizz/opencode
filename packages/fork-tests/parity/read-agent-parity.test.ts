import { expect, test } from "bun:test"
import path from "path"

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function between(text: string, start: string, end: string) {
  const left = text.indexOf(start)
  if (left === -1) return ""
  const right = text.indexOf(end, left + start.length)
  if (right === -1) return ""
  return text.slice(left, right)
}

function envCases(text: string) {
  const keys = [".env", ".env.local", ".env.production", ".env.development.local"]
  const result: Record<string, string> = {}
  for (const key of keys) {
    const match = text.match(new RegExp(`\\["${escape(key)}",\\s*(true|false)\\]`))
    result[key] = match?.[1] ?? "missing"
  }
  return result
}

function containsList(text: string, start: string, end: string) {
  const block = between(text, start, end)
  return Array.from(block.matchAll(/toContain\("([^"]+)"\)/g)).map((item) => item[1])
}

function doomLoopExpectation(text: string) {
  const match = text.match(/expect\(evalPerm\(build, "doom_loop"\)\)\.toBe\("([^"]+)"\)/)
  return match?.[1] ?? "missing"
}

test("fork-tests read/agent expectations match opencode tests", async () => {
  const root = path.resolve(import.meta.dir, "..", "..", "..")
  const opReadPath = path.join(root, "packages/opencode/test/tool/read.test.ts")
  const opAgentPath = path.join(root, "packages/opencode/test/agent/agent.test.ts")
  const forkReadPath = path.join(root, "packages/fork-tests/tool/read.test.ts")
  const forkAgentPath = path.join(root, "packages/fork-tests/agent/agent.test.ts")

  const opRead = await Bun.file(opReadPath).text()
  const opAgent = await Bun.file(opAgentPath).text()
  const forkRead = await Bun.file(forkReadPath).text()
  const forkAgent = await Bun.file(forkAgentPath).text()

  const issues: string[] = []

  const opEnv = envCases(opRead)
  const forkEnv = envCases(forkRead)
  for (const key of Object.keys(opEnv)) {
    if (opEnv[key] === forkEnv[key]) continue
    issues.push(`env case mismatch for ${key}: opencode=${opEnv[key]} fork-tests=${forkEnv[key]}`)
  }

  const largeStart = 'test("truncates large file by bytes and sets truncated metadata"'
  const lineStart = 'test("truncates by line count when limit is specified"'
  const smallStart = 'test("does not truncate small file"'
  const opLarge = containsList(opRead, largeStart, lineStart)
  const forkLarge = containsList(forkRead, largeStart, lineStart)
  const opLine = containsList(opRead, lineStart, smallStart)
  const forkLine = containsList(forkRead, lineStart, smallStart)

  if (JSON.stringify(opLarge) !== JSON.stringify(forkLarge)) {
    issues.push(
      `byte truncation expectations mismatch: opencode=${JSON.stringify(opLarge)} fork-tests=${JSON.stringify(forkLarge)}`,
    )
  }
  if (JSON.stringify(opLine) !== JSON.stringify(forkLine)) {
    issues.push(
      `line truncation expectations mismatch: opencode=${JSON.stringify(opLine)} fork-tests=${JSON.stringify(forkLine)}`,
    )
  }

  const opDoom = doomLoopExpectation(opAgent)
  const forkDoom = doomLoopExpectation(forkAgent)
  if (opDoom !== forkDoom) {
    issues.push(`doom_loop default mismatch: opencode=${opDoom} fork-tests=${forkDoom}`)
  }

  expect(issues).toEqual([])
})
