#!/usr/bin/env bun

import { spawn } from "child_process"
import fs from "fs"
import path from "path"

const readyPattern = /opencode server listening on http:\/\/127\.0\.0\.1:\d+/i
const hardFailurePatterns = [
  /tsyringe requires a reflect polyfill/i,
  /authRoutes is not a function/i,
  /Auth route initialization failed/i,
]

function hostPrefix() {
  const os = process.platform === "win32" ? "windows" : process.platform
  return `opencode-${os}-${process.arch}`
}

function findCompiledBinary(): string {
  const distDir = path.resolve(import.meta.dir, "..", "dist")
  if (!fs.existsSync(distDir)) {
    throw new Error(`Compiled dist directory not found: ${distDir}`)
  }

  const binaryName = process.platform === "win32" ? "opencode.exe" : "opencode"
  const dirs = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("opencode-"))
    .map((entry) => entry.name)

  const preferredPrefix = hostPrefix()
  const orderedDirs = [
    ...dirs.filter((name) => name.startsWith(preferredPrefix)),
    ...dirs.filter((name) => !name.startsWith(preferredPrefix)),
  ]

  for (const name of orderedDirs) {
    const candidate = path.join(distDir, name, "bin", binaryName)
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error(`No compiled opencode binary found in ${distDir}`)
}

async function run() {
  const binary = findCompiledBinary()
  const args = ["serve", "--hostname", "127.0.0.1", "--port", "0"]
  const child = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  const timeoutMs = 20_000

  const appendOutput = (chunk: Buffer | string) => {
    output += chunk.toString()
  }

  const failureMessage = (message: string): string => {
    const tail = output.trim().split("\n").slice(-40).join("\n")
    return `${message}\n\nRecent output:\n${tail || "(no output)"}`
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      child.stdout?.off("data", onOutput)
      child.stderr?.off("data", onOutput)
      child.off("exit", onExit)
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(failureMessage(message)))
    }

    const pass = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const onOutput = (chunk: Buffer | string) => {
      appendOutput(chunk)

      if (hardFailurePatterns.some((pattern) => pattern.test(output))) {
        fail("Compiled opencode startup failed with a known auth runtime error.")
        return
      }

      if (readyPattern.test(output)) {
        pass()
      }
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      fail(`Compiled opencode exited before readiness (code=${code}, signal=${signal})`)
    }

    timeout = setTimeout(() => {
      fail(`Timed out waiting for compiled opencode readiness after ${timeoutMs}ms`)
    }, timeoutMs)

    child.stdout?.on("data", onOutput)
    child.stderr?.on("data", onOutput)
    child.on("exit", onExit)
  }).finally(() => {
    if (!child.killed) child.kill("SIGTERM")
  })

  await new Promise<void>((resolve) => {
    const killTimeout = setTimeout(() => {
      child.kill("SIGKILL")
      resolve()
    }, 2_000)

    child.once("exit", () => {
      clearTimeout(killTimeout)
      resolve()
    })
  })

  console.log("Compiled opencode smoke check passed")
}

await run()
