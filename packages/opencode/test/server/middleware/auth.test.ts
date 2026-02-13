import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { ServerAuth } from "../../../src/config/server-auth"
import { UserSession } from "../../../src/session/user-session"
import { authMiddleware, type AuthEnv } from "../../../src/server/middleware/auth"

const baseAuthConfig = {
  enabled: true,
  method: "pam" as const,
  sessionTimeout: "7d",
  rememberMeDuration: "90d",
  requireHttps: "warn" as const,
  rateLimiting: true,
  rateLimitWindow: "15m",
  rateLimitMax: 5,
  allowedUsers: [],
  sessionPersistence: true,
  csrfVerboseErrors: false,
  debugBrokerErrors: true,
  csrfAllowlist: [],
  twoFactorEnabled: true,
  twoFactorTokenTimeout: "5m",
  deviceTrustDuration: "30d",
  otpRateLimitMax: 5,
  otpRateLimitWindow: "15m",
  twoFactorRequired: true,
  trustProxy: "auto" as const,
}

describe("auth middleware TOTP setup gating", () => {
  let originalAuthConfig: ReturnType<typeof ServerAuth.get>
  const createdSessionIds: string[] = []

  beforeEach(() => {
    originalAuthConfig = ServerAuth.get()
    ServerAuth._setForTesting({ ...baseAuthConfig })
  })

  afterEach(() => {
    ServerAuth._setForTesting(originalAuthConfig)
    for (const sessionId of createdSessionIds) {
      UserSession.remove(sessionId)
    }
    createdSessionIds.length = 0
  })

  const createApp = () => new Hono<AuthEnv>().use("*", authMiddleware).get("/project", (c) => c.json({ ok: true }))

  const createSession = () => {
    const session = UserSession.create("testuser", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/testuser",
      shell: "/bin/bash",
    })
    createdSessionIds.push(session.id)
    return session
  }

  test("returns TOTP setup required code for API requests", async () => {
    const session = createSession()
    UserSession.setTotpPending(session.id)

    const app = createApp()
    const res = await app.request("/project", {
      headers: {
        Accept: "application/json",
        Cookie: `opencode_session=${session.id}`,
      },
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("2fa_setup_required")
    expect(body.code).toBe("totp_setup_required")
    expect(body.message).toBe("TOTP setup is required")
  })

  test("uses legacy twoFactorPending as fallback when totpPending is unset", async () => {
    const session = createSession()
    const storedSession = UserSession.get(session.id)
    expect(storedSession).toBeDefined()
    if (!storedSession) return
    storedSession.totpPending = undefined
    storedSession.twoFactorPending = true

    const app = createApp()
    const res = await app.request("/project", {
      headers: {
        Accept: "application/json",
        Cookie: `opencode_session=${session.id}`,
      },
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe("totp_setup_required")
  })

  test("redirects browser requests to required TOTP setup page", async () => {
    const session = createSession()
    UserSession.setTotpPending(session.id)

    const app = createApp()
    const res = await app.request("/project", {
      headers: {
        Accept: "text/html",
        Cookie: `opencode_session=${session.id}`,
      },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("/auth/totp/setup?required=1")
  })

  test("allows requests when TOTP is pending but not required", async () => {
    const session = createSession()
    UserSession.setTotpPending(session.id)
    ServerAuth._setForTesting({ ...baseAuthConfig, twoFactorRequired: false })

    const app = createApp()
    const res = await app.request("/project", {
      headers: {
        Accept: "application/json",
        Cookie: `opencode_session=${session.id}`,
      },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
