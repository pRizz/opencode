import type { Context } from "hono"
import type { AuthEnv } from "@opencode-ai/fork-auth/middleware/auth"
import { getAuthContext } from "@opencode-ai/fork-auth/middleware/auth"
import { BrokerClient } from "@opencode-ai/fork-auth/auth/broker-client"

type PtyRouteLogger = {
  info(message?: any, extra?: Record<string, any>): void
  warn(message?: any, extra?: Record<string, any>): void
}

export type CreateErrorStatus = 404 | 500 | 503

type CreateErrorMapper = (error: unknown, message: string) => { code: string; status: CreateErrorStatus }

type MaybeHandleAuthPtyCreateParams<TInput, TInfo> = {
  c: Context<AuthEnv>
  requestId: string
  authEnabled: boolean
  input: TInput
  createPty: (input: TInput, sessionId: string, requestId: string) => Promise<TInfo>
  mapCreateError: CreateErrorMapper
  getErrorMessage: (error: unknown) => string
  log: PtyRouteLogger
}

type BrokerSessionInfo = {
  id: string
  username: string
  uid?: number
  gid?: number
  home?: string
  shell?: string
}

export function getPtyErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Unknown error"
}

export function mapPtyCreateError(error: unknown, message: string): { code: string; status: CreateErrorStatus } {
  if (error && typeof error === "object") {
    const code = typeof (error as { code?: string }).code === "string" ? (error as { code: string }).code : undefined
    if (code === "broker_session_not_found") {
      return { code, status: 404 }
    }
    if (code === "broker_unavailable") {
      return { code, status: 503 }
    }
  }
  const normalized = message.toLowerCase()
  if (normalized.includes("session not found")) {
    return { code: "broker_session_not_found", status: 404 }
  }
  if (normalized.includes("broker unavailable")) {
    return { code: "broker_unavailable", status: 503 }
  }
  return { code: "pty_create_failed", status: 500 }
}

export function createPtyRequestId(): string {
  return crypto.randomUUID()
}

export function resolvePtyConnectRequestId(c: Context<AuthEnv>): string {
  const requestId = c.req.query("requestId") ?? createPtyRequestId()
  c.set("ptyRequestId", requestId)
  return requestId
}

export function maybeRequirePtyAuth(c: Context<AuthEnv>, authEnabled: boolean): Response | null {
  if (!authEnabled) return null
  const auth = getAuthContext(c)
  if (!auth) {
    return c.json({ error: "Authentication required" }, 401)
  }
  return null
}

export async function maybeHandleAuthPtyCreate<TInput, TInfo>({
  c,
  requestId,
  authEnabled,
  input,
  createPty,
  mapCreateError,
  getErrorMessage,
  log,
}: MaybeHandleAuthPtyCreateParams<TInput, TInfo>): Promise<Response | null> {
  if (!authEnabled) return null

  const auth = getAuthContext(c)
  if (!auth) {
    return c.json({ error: "Authentication required" }, 401)
  }
  const session = c.get("session") as BrokerSessionInfo | undefined
  if (!session) {
    return c.json({ error: "Session not found", code: "session_missing" }, 401)
  }
  if (!session.uid || !session.gid || !session.home || !session.shell) {
    return c.json({ error: "Session missing user info", code: "session_missing_user_info" }, 500)
  }

  const brokerClient = new BrokerClient()
  const registered = await brokerClient.registerSession(session.id, {
    username: session.username,
    uid: session.uid,
    gid: session.gid,
    home: session.home,
    shell: session.shell,
  })

  if (!registered) {
    return c.json(
      {
        error: "Broker unavailable",
        code: "broker_unavailable",
        requestId,
      },
      503,
    )
  }

  try {
    const info = await createPty(input, auth.sessionId, requestId)
    log.info("pty created", { requestId, sessionId: auth.sessionId, ptyId: (info as { id?: string }).id })
    return c.json(info)
  } catch (error) {
    const message = getErrorMessage(error)
    const mapped = mapCreateError(error, message)
    log.warn("pty create failed", {
      requestId,
      sessionId: auth.sessionId,
      code: mapped.code,
      error: message,
    })
    return c.json({ error: message, code: mapped.code, requestId }, mapped.status)
  }
}
