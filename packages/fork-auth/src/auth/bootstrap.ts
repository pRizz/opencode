import { Log } from "../../../opencode/src/util/log"

const log = Log.create({ service: "auth-bootstrap" })

const HELPER_PATH = "/usr/local/bin/opencode-cloud-bootstrap"
const SUDO_BIN = "sudo"
const SUDO_ARGS = ["-n"]

type HelperPayload = Record<string, string>

interface HelperResponse {
  ok?: boolean
  active?: boolean
  created?: boolean
  completed?: boolean
  created_at?: string
  completed_at?: string
  username?: string
  code?: string
  reason?: string
  message?: string
  status?: number
}

interface HelperCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type BootstrapErrorCode =
  | "inactive"
  | "otp_invalid"
  | "username_exists"
  | "unsupported_platform"
  | "invalid_username"
  | "invalid_password"
  | "create_failed"
  | "invalid_request"
  | "helper_error"

export interface BootstrapStatusResult {
  active: boolean
  available: boolean
  createdAt?: string
  completedAt?: string
  reason?: string
}

export type BootstrapVerifyResult =
  | { ok: true }
  | {
      ok: false
      code: BootstrapErrorCode
      message: string
      status: number
    }

export type BootstrapCreateUserResult =
  | {
      ok: true
      username: string
    }
  | {
      ok: false
      code: BootstrapErrorCode
      message: string
      status: number
    }

export type BootstrapCompleteResult =
  | {
      ok: true
      username?: string
    }
  | {
      ok: false
      code: BootstrapErrorCode
      message: string
      status: number
    }

function parseHelperJson(raw: string): HelperResponse | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as HelperResponse
    if (!parsed || typeof parsed !== "object") return undefined
    return parsed
  } catch {
    return undefined
  }
}

function expectedHelperUnavailable(stderr: string): boolean {
  const lower = stderr.toLowerCase()
  return (
    lower.includes("no such file") ||
    lower.includes("not found") ||
    lower.includes("password is required") ||
    lower.includes("a terminal is required")
  )
}

async function runHelper(subcommand: string, payload?: HelperPayload): Promise<HelperCommandResult | undefined> {
  const command = [SUDO_BIN, ...SUDO_ARGS, HELPER_PATH, subcommand]

  try {
    const result = Bun.spawnSync(command, {
      stdin: payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined,
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = new TextDecoder().decode(result.stdout).trim()
    const stderr = new TextDecoder().decode(result.stderr).trim()

    return {
      exitCode: typeof result.exitCode === "number" ? result.exitCode : 1,
      stdout,
      stderr,
    }
  } catch (error) {
    log.warn("bootstrap helper invocation failed", { subcommand, error })
    return undefined
  }
}

function helperFailureResult(result: HelperCommandResult | undefined): {
  code: "helper_error"
  message: string
  status: number
} {
  if (!result) {
    return {
      code: "helper_error",
      message: "Bootstrap helper is unavailable.",
      status: 503,
    }
  }

  if (expectedHelperUnavailable(result.stderr)) {
    return {
      code: "helper_error",
      message: "Bootstrap helper is unavailable.",
      status: 503,
    }
  }

  log.warn("bootstrap helper returned non-zero exit code", {
    exitCode: result.exitCode,
    stderr: result.stderr,
  })
  return {
    code: "helper_error",
    message: "Bootstrap helper failed unexpectedly.",
    status: 500,
  }
}

function normalizeErrorResponse(response: HelperResponse | undefined): {
  code: BootstrapErrorCode
  message: string
  status: number
} {
  if (!response) {
    return {
      code: "helper_error",
      message: "Bootstrap helper returned invalid output.",
      status: 500,
    }
  }

  const reason = response.code ?? response.reason
  if (reason === "otp_invalid") {
    return { code: "otp_invalid", message: response.message ?? "Invalid one-time password.", status: 401 }
  }
  if (reason === "inactive" || reason === "user_exists" || reason === "not_initialized") {
    return { code: "inactive", message: response.message ?? "Bootstrap flow is not active.", status: 403 }
  }
  if (reason === "completed") {
    return {
      code: "inactive",
      message: response.message ?? "Bootstrap flow is already complete.",
      status: 403,
    }
  }
  if (reason === "username_exists") {
    return { code: "username_exists", message: response.message ?? "Username already exists.", status: 409 }
  }
  if (reason === "unsupported_platform") {
    return {
      code: "unsupported_platform",
      message: response.message ?? "Initial signup is currently supported only on Ubuntu containers.",
      status: 400,
    }
  }
  if (reason === "invalid_username") {
    return { code: "invalid_username", message: response.message ?? "Invalid username.", status: 400 }
  }
  if (reason === "invalid_password") {
    return { code: "invalid_password", message: response.message ?? "Invalid password.", status: 400 }
  }
  if (reason === "create_failed") {
    return { code: "create_failed", message: response.message ?? "Failed to create Linux user.", status: 500 }
  }
  if (reason === "invalid_request") {
    return { code: "invalid_request", message: response.message ?? "Invalid request payload.", status: 400 }
  }

  return {
    code: "helper_error",
    message: response.message ?? "Bootstrap helper failed unexpectedly.",
    status: response.status ?? 500,
  }
}

export async function getBootstrapStatus(): Promise<BootstrapStatusResult> {
  const result = await runHelper("status")
  if (!result) {
    return { active: false, available: false, reason: "helper_unavailable" }
  }

  if (result.exitCode !== 0) {
    if (!expectedHelperUnavailable(result.stderr)) {
      log.warn("bootstrap status command failed", { exitCode: result.exitCode, stderr: result.stderr })
    }
    return { active: false, available: false, reason: "helper_unavailable" }
  }

  const parsed = parseHelperJson(result.stdout)
  if (!parsed) {
    log.warn("bootstrap status command returned non-json payload")
    return { active: false, available: false, reason: "invalid_helper_output" }
  }

  if (parsed.active !== true) {
    return {
      active: false,
      available: true,
      reason: parsed.reason ?? "inactive",
      completedAt: parsed.completed_at,
    }
  }

  return {
    active: true,
    available: true,
    createdAt: parsed.created_at,
  }
}

export async function verifyBootstrapOtp(otp: string): Promise<BootstrapVerifyResult> {
  const result = await runHelper("verify", { otp })
  if (!result || result.exitCode !== 0) {
    const failure = helperFailureResult(result)
    return { ok: false, ...failure }
  }

  const parsed = parseHelperJson(result.stdout)
  if (parsed?.ok === true && parsed.active === true) {
    return { ok: true }
  }

  const normalized = normalizeErrorResponse(parsed)
  return { ok: false, ...normalized }
}

export async function createBootstrapUser(params: {
  otp: string
  username: string
  password: string
}): Promise<BootstrapCreateUserResult> {
  const result = await runHelper("create-user", {
    otp: params.otp,
    username: params.username,
    password: params.password,
  })
  if (!result || result.exitCode !== 0) {
    const failure = helperFailureResult(result)
    return { ok: false, ...failure }
  }

  const parsed = parseHelperJson(result.stdout)
  if (parsed?.ok === true && parsed.created === true && typeof parsed.username === "string") {
    return { ok: true, username: parsed.username }
  }

  const normalized = normalizeErrorResponse(parsed)
  return { ok: false, ...normalized }
}

export async function completeBootstrapOtp(otp: string): Promise<BootstrapCompleteResult> {
  const result = await runHelper("complete", { otp })
  if (!result || result.exitCode !== 0) {
    const failure = helperFailureResult(result)
    return { ok: false, ...failure }
  }

  const parsed = parseHelperJson(result.stdout)
  if (parsed?.ok === true && parsed.completed === true) {
    return { ok: true, username: parsed.username }
  }

  const normalized = normalizeErrorResponse(parsed)
  return { ok: false, ...normalized }
}
