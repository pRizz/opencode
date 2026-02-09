// IMPORTANT: Set env vars before test imports to avoid reading host machine state.
import fsSync from "fs"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterAll } from "bun:test"

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const dir = path.join(os.tmpdir(), "opencode-fork-tests-" + process.pid + "-" + Math.random().toString(36).slice(2))
await fs.mkdir(dir, { recursive: true })

afterAll(() => {
  fsSync.rmSync(dir, { recursive: true, force: true })
})

const testHome = path.join(dir, "home")
await fs.mkdir(testHome, { recursive: true })
process.env["OPENCODE_TEST_HOME"] = testHome
process.env["XDG_DATA_HOME"] = path.join(dir, "share")
process.env["XDG_CACHE_HOME"] = path.join(dir, "cache")
process.env["XDG_CONFIG_HOME"] = path.join(dir, "config")
process.env["XDG_STATE_HOME"] = path.join(dir, "state")
process.env["OPENCODE_MODELS_PATH"] = path.resolve(import.meta.dir, "../tool/fixtures/models-api.json")

let config: Record<string, unknown> = {}
const existingConfig = process.env["OPENCODE_CONFIG_CONTENT"]
if (existingConfig) {
  try {
    config = asRecord(JSON.parse(existingConfig))
  } catch {
    config = {}
  }
}

const auth = asRecord(config["auth"])
config["auth"] = {
  ...auth,
  enabled: false,
}
process.env["OPENCODE_CONFIG_CONTENT"] = JSON.stringify(config)
