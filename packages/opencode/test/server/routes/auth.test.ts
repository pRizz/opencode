import { describe, test, expect, mock, beforeEach } from "bun:test"
import { Hono } from "hono"
import path from "path"
import type { AuthResult } from "../../../src/auth/broker-client"
import type { UnixUserInfo } from "../../../src/auth/user-info"
import type { AuthConfig } from "../../../src/config/auth"
import { UserSession } from "../../../src/session/user-session"
import { generateCSRFToken, getCSRFSecret } from "../../../src/server/security/csrf"

// Mock state with explicit types
const mockAuthenticate = mock<() => Promise<AuthResult>>(() => Promise.resolve({ success: true }))
const mockGetUserInfo = mock<() => Promise<UnixUserInfo | null>>(() =>
  Promise.resolve({
    username: "testuser",
    uid: 1000,
    gid: 1000,
    gecos: "Test User",
    home: "/home/testuser",
    shell: "/bin/bash",
  }),
)

const mockCreatePasskeyAuthenticationOptions = mock<
  () => Promise<{ options: Record<string, unknown>; challengeToken: string }>
>(() =>
  Promise.resolve({
    options: { challenge: "challenge", rpId: "localhost" },
    challengeToken: "challenge-token",
  }),
)
const mockVerifyPasskeyAuthentication = mock<() => Promise<{ verified: boolean; username?: string; error?: string }>>(
  () => Promise.resolve({ verified: false, error: "failed" }),
)
const mockCreatePasskeyRegistrationOptions = mock<
  () => Promise<{ options: Record<string, unknown>; challengeToken: string }>
>(() =>
  Promise.resolve({
    options: { challenge: "registration-challenge" },
    challengeToken: "registration-token",
  }),
)
const mockVerifyPasskeyRegistration = mock<
  () => Promise<{ verified: boolean; credential?: Record<string, unknown>; error?: string }>
>(() => Promise.resolve({ verified: false, error: "failed" }))
const mockListUserPasskeys = mock<() => Promise<Array<Record<string, unknown>>>>(() => Promise.resolve([]))
const mockRemoveUserPasskey = mock<() => Promise<boolean>>(() => Promise.resolve(false))
const mockCheckTotp = mock<() => Promise<boolean>>(() => Promise.resolve(false))
const mockBrokerPing = mock<() => Promise<boolean>>(() => Promise.resolve(true))
const mockGetBootstrapStatus = mock<
  () => Promise<{ active: boolean; available: boolean; createdAt?: string; completedAt?: string; reason?: string }>
>(() => Promise.resolve({ active: false, available: false }))
const mockVerifyBootstrapOtp = mock<
  () => Promise<{ ok: true } | { ok: false; code: string; message: string; status: number }>
>(() => Promise.resolve({ ok: false, code: "inactive", message: "inactive", status: 403 }))
const mockCreateBootstrapUser = mock<
  () => Promise<{ ok: true; username: string } | { ok: false; code: string; message: string; status: number }>
>(() => Promise.resolve({ ok: false, code: "inactive", message: "inactive", status: 403 }))
const mockCompleteBootstrapOtp = mock<
  () => Promise<{ ok: true; username?: string } | { ok: false; code: string; message: string; status: number }>
>(() => Promise.resolve({ ok: true, username: "opencoder" }))

// Server auth config state for mocking
let mockAuthConfig: AuthConfig = {
  enabled: true,
  method: "pam",
  sessionTimeout: "7d",
  rememberMeDuration: "90d",
  requireHttps: "warn",
  rateLimiting: false, // Disabled by default for tests, enabled explicitly where needed
  rateLimitWindow: "15m",
  rateLimitMax: 5,
  allowedUsers: [],
  sessionPersistence: true,
  csrfVerboseErrors: false,
  debugBrokerErrors: true,
  csrfAllowlist: [],
  twoFactorEnabled: false,
  twoFactorTokenTimeout: "5m",
  deviceTrustDuration: "30d",
  otpRateLimitMax: 5,
  otpRateLimitWindow: "15m",
  twoFactorRequired: false,
  passkeysEnabled: false,
  passkeyRpName: "opencode",
  passkeyAllowedOrigins: [],
  passkeyChallengeTimeout: "5m",
  passkeyRequireUserVerification: true,
  trustProxy: "auto",
}

// Mock for registerSession (fire-and-forget, just needs to not throw)
const mockRegisterSession = mock<() => Promise<boolean>>(() => Promise.resolve(true))
const mockUnregisterSession = mock<() => Promise<boolean>>(() => Promise.resolve(true))

// Apply mocks before importing the module under test
mock.module("../../../src/auth/broker-client", () => ({
  BrokerClient: class {
    authenticate = mockAuthenticate
    registerSession = mockRegisterSession
    unregisterSession = mockUnregisterSession
    checkTotp = mockCheckTotp
    check2fa = mockCheckTotp
    ping = mockBrokerPing
  },
}))
mock.module("@opencode-ai/fork-auth/auth/broker-client", () => ({
  BrokerClient: class {
    authenticate = mockAuthenticate
    registerSession = mockRegisterSession
    unregisterSession = mockUnregisterSession
    checkTotp = mockCheckTotp
    check2fa = mockCheckTotp
    ping = mockBrokerPing
  },
}))
mock.module("../../../src/auth/user-info", () => ({
  getUserInfo: mockGetUserInfo,
}))
mock.module("@opencode-ai/fork-auth/auth/user-info", () => ({
  getUserInfo: mockGetUserInfo,
}))
mock.module("../../../src/auth/passkey", () => ({
  createPasskeyAuthenticationOptions: mockCreatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication: mockVerifyPasskeyAuthentication,
  createPasskeyRegistrationOptions: mockCreatePasskeyRegistrationOptions,
  verifyPasskeyRegistration: mockVerifyPasskeyRegistration,
  listUserPasskeys: mockListUserPasskeys,
  removeUserPasskey: mockRemoveUserPasskey,
}))
mock.module("@opencode-ai/fork-auth/auth/passkey", () => ({
  createPasskeyAuthenticationOptions: mockCreatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication: mockVerifyPasskeyAuthentication,
  createPasskeyRegistrationOptions: mockCreatePasskeyRegistrationOptions,
  verifyPasskeyRegistration: mockVerifyPasskeyRegistration,
  listUserPasskeys: mockListUserPasskeys,
  removeUserPasskey: mockRemoveUserPasskey,
}))
mock.module("../../../src/auth/bootstrap", () => ({
  getBootstrapStatus: mockGetBootstrapStatus,
  verifyBootstrapOtp: mockVerifyBootstrapOtp,
  createBootstrapUser: mockCreateBootstrapUser,
  completeBootstrapOtp: mockCompleteBootstrapOtp,
}))
mock.module("@opencode-ai/fork-auth/auth/bootstrap", () => ({
  getBootstrapStatus: mockGetBootstrapStatus,
  verifyBootstrapOtp: mockVerifyBootstrapOtp,
  createBootstrapUser: mockCreateBootstrapUser,
  completeBootstrapOtp: mockCompleteBootstrapOtp,
}))
mock.module("../../../src/config/server-auth", () => ({
  ServerAuth: {
    get: () => mockAuthConfig,
    isEnabled: () => mockAuthConfig.enabled,
    _setForTesting: (config: AuthConfig) => {
      mockAuthConfig = config
    },
    _reset: () => {
      mockAuthConfig = {
        enabled: true,
        method: "pam",
        sessionTimeout: "7d",
        rememberMeDuration: "90d",
        requireHttps: "warn",
        rateLimiting: false, // Disabled by default for tests
        rateLimitWindow: "15m",
        rateLimitMax: 5,
        allowedUsers: [],
        sessionPersistence: true,
        csrfVerboseErrors: false,
        debugBrokerErrors: true,
        csrfAllowlist: [],
        twoFactorEnabled: false,
        twoFactorTokenTimeout: "5m",
        deviceTrustDuration: "30d",
        otpRateLimitMax: 5,
        otpRateLimitWindow: "15m",
        twoFactorRequired: false,
        passkeysEnabled: false,
        passkeyRpName: "opencode",
        passkeyAllowedOrigins: [],
        passkeyChallengeTimeout: "5m",
        passkeyRequireUserVerification: true,
        trustProxy: "auto",
      }
    },
  },
}))
mock.module("@opencode-ai/fork-auth/server-auth", () => ({
  ServerAuth: {
    get: () => mockAuthConfig,
    isEnabled: () => mockAuthConfig.enabled,
    _setForTesting: (config: AuthConfig) => {
      mockAuthConfig = config
    },
    _reset: () => {
      mockAuthConfig = {
        enabled: true,
        method: "pam",
        sessionTimeout: "7d",
        rememberMeDuration: "90d",
        requireHttps: "warn",
        rateLimiting: false, // Disabled by default for tests
        rateLimitWindow: "15m",
        rateLimitMax: 5,
        allowedUsers: [],
        sessionPersistence: true,
        csrfVerboseErrors: false,
        debugBrokerErrors: true,
        csrfAllowlist: [],
        twoFactorEnabled: false,
        twoFactorTokenTimeout: "5m",
        deviceTrustDuration: "30d",
        otpRateLimitMax: 5,
        otpRateLimitWindow: "15m",
        twoFactorRequired: false,
        passkeysEnabled: false,
        passkeyRpName: "opencode",
        passkeyAllowedOrigins: [],
        passkeyChallengeTimeout: "5m",
        passkeyRequireUserVerification: true,
        trustProxy: "auto",
      }
    },
  },
}))

// Import after mocking
const { AuthRoutes } = await import("../../../src/server/routes/auth")
const { setUiDir } = await import("../../../src/server/ui-dir")

setUiDir(path.resolve(import.meta.dir, "../../../..", "app"))

// Helper to set mock auth config
function setMockAuthConfig(config: Partial<AuthConfig>) {
  mockAuthConfig = {
    enabled: true,
    method: "pam",
    sessionTimeout: "7d",
    rememberMeDuration: "90d",
    requireHttps: "warn",
    rateLimiting: false, // Disabled by default for tests
    rateLimitWindow: "15m",
    rateLimitMax: 5,
    allowedUsers: [],
    sessionPersistence: true,
    csrfVerboseErrors: false,
    debugBrokerErrors: true,
    csrfAllowlist: [],
    twoFactorEnabled: false,
    twoFactorTokenTimeout: "5m",
    deviceTrustDuration: "30d",
    otpRateLimitMax: 5,
    otpRateLimitWindow: "15m",
    twoFactorRequired: false,
    passkeysEnabled: false,
    passkeyRpName: "opencode",
    passkeyAllowedOrigins: [],
    passkeyChallengeTimeout: "5m",
    passkeyRequireUserVerification: true,
    trustProxy: "auto",
    ...config,
  }
}

function withRailwayEnv<T>(callback: () => Promise<T>): Promise<T> {
  const previous = process.env.RAILWAY_ENVIRONMENT
  process.env.RAILWAY_ENVIRONMENT = "production"
  return callback().finally(() => {
    if (previous === undefined) {
      delete process.env.RAILWAY_ENVIRONMENT
      return
    }
    process.env.RAILWAY_ENVIRONMENT = previous
  })
}

describe("POST /auth/login", () => {
  let app: Hono

  beforeEach(() => {
    // Reset mocks
    mockAuthenticate.mockClear()
    mockGetUserInfo.mockClear()
    mockCreatePasskeyAuthenticationOptions.mockClear()
    mockVerifyPasskeyAuthentication.mockClear()
    mockCreatePasskeyRegistrationOptions.mockClear()
    mockVerifyPasskeyRegistration.mockClear()
    mockListUserPasskeys.mockClear()
    mockRemoveUserPasskey.mockClear()
    mockCheckTotp.mockClear()
    mockBrokerPing.mockClear()

    // Default successful mocks
    mockAuthenticate.mockResolvedValue({ success: true })
    mockGetUserInfo.mockResolvedValue({
      username: "testuser",
      uid: 1000,
      gid: 1000,
      gecos: "Test User",
      home: "/home/testuser",
      shell: "/bin/bash",
    })
    mockCreatePasskeyAuthenticationOptions.mockResolvedValue({
      options: { challenge: "challenge", rpId: "localhost" },
      challengeToken: "challenge-token",
    })
    mockVerifyPasskeyAuthentication.mockResolvedValue({ verified: false, error: "failed" })
    mockCreatePasskeyRegistrationOptions.mockResolvedValue({
      options: { challenge: "registration-challenge" },
      challengeToken: "registration-token",
    })
    mockVerifyPasskeyRegistration.mockResolvedValue({ verified: false, error: "failed" })
    mockListUserPasskeys.mockResolvedValue([])
    mockRemoveUserPasskey.mockResolvedValue(false)
    mockCheckTotp.mockResolvedValue(false)
    mockBrokerPing.mockResolvedValue(true)
    setMockAuthConfig({ enabled: true, method: "pam" })

    app = new Hono().route("/auth", AuthRoutes())
  })

  test("returns 400 when X-Requested-With header missing", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test", password: "pass" }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("csrf_missing")
  })

  test("returns 400 when username missing", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ password: "pass" }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid_request")
  })

  test("returns 400 when password missing", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "test" }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid_request")
  })

  test("returns 401 when authentication fails", async () => {
    mockAuthenticate.mockResolvedValue({ success: false, error: "Invalid credentials" })

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "test", password: "wrong" }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("auth_failed")
    expect(body.message).toBe("Authentication failed") // Generic, no details
  })

  test("returns 503 when broker is unavailable", async () => {
    mockAuthenticate.mockResolvedValue({
      success: false,
      code: "broker_unavailable",
      reason: "socket_missing",
      error: "authentication service unavailable",
    })

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "test", password: "wrong" }),
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe("broker_unavailable")
    expect(body.message).toBe("Authentication service unavailable. Please try again later.")
    expect(body.details?.reason).toBe("socket_missing")
    expect(typeof body.details?.requestId).toBe("string")
  })

  test("returns 429 when broker rate limits", async () => {
    mockAuthenticate.mockResolvedValue({
      success: false,
      code: "rate_limit_exceeded",
      error: "too many authentication attempts, retry after 10s",
      retryAfterSeconds: 10,
    })

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "test", password: "wrong" }),
    })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("10")
    const body = await res.json()
    expect(body.error).toBe("rate_limit_exceeded")
    expect(body.message).toBe("too many authentication attempts, retry after 10s")
  })

  test("returns 200 with user info on successful login", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.user.username).toBe("testuser")
    expect(body.user.uid).toBe(1000)
    expect(body.user.gid).toBe(1000)
    expect(body.user.home).toBe("/home/testuser")
    expect(body.user.shell).toBe("/bin/bash")
  })

  test("sets session cookie on successful login", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct" }),
    })
    expect(res.status).toBe(200)
    const cookie = res.headers.get("Set-Cookie")
    expect(cookie).toContain("opencode_session=")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
  })

  test("accepts form POST body", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ username: "testuser", password: "correct" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test("rejects invalid returnUrl (double slash)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct", returnUrl: "//evil.com" }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid_return_url")
  })

  test("rejects invalid returnUrl (absolute URL)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct", returnUrl: "https://evil.com" }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid_return_url")
  })

  test("accepts valid returnUrl", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct", returnUrl: "/dashboard" }),
    })
    expect(res.status).toBe(200)
  })

  test("returns 403 when auth is disabled", async () => {
    setMockAuthConfig({ enabled: false })

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "test", password: "pass" }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("auth_disabled")
  })

  test("returns 401 when user info lookup fails", async () => {
    mockGetUserInfo.mockResolvedValue(null)

    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct" }),
    })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe("auth_failed")
  })

  test("returns 400 for unsupported Content-Type", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: "username=test&password=pass",
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid_content_type")
  })
})

describe("GET /auth/status", () => {
  let app: Hono

  beforeEach(() => {
    setMockAuthConfig({ enabled: true, method: "pam" })
    app = new Hono().route("/auth", AuthRoutes())
  })

  test("returns enabled true when auth is enabled", async () => {
    setMockAuthConfig({ enabled: true, method: "pam" })

    const res = await app.request("/auth/status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enabled).toBe(true)
    expect(body.method).toBe("pam")
  })

  test("returns enabled false when auth is disabled", async () => {
    setMockAuthConfig({ enabled: false })

    const res = await app.request("/auth/status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enabled).toBe(false)
    expect(body.method).toBeUndefined()
  })

  test("returns enabled false when auth config missing", async () => {
    setMockAuthConfig({ enabled: false })

    const res = await app.request("/auth/status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enabled).toBe(false)
  })

  test("does not require authentication", async () => {
    // Status endpoint should be accessible without session cookie
    setMockAuthConfig({ enabled: true, method: "pam" })

    const res = await app.request("/auth/status")
    expect(res.status).toBe(200)
  })
})

describe("GET /auth/device-trust/status", () => {
  let app: Hono

  beforeEach(() => {
    setMockAuthConfig({ enabled: true, method: "pam", twoFactorEnabled: true })
    mockCheckTotp.mockClear()
    mockCheckTotp.mockResolvedValue(true)
    app = new Hono().route("/auth", AuthRoutes())
  })

  test("returns canonical totp fields and legacy twoFactor aliases", async () => {
    const session = UserSession.create("testuser", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/testuser",
      shell: "/bin/bash",
    })

    const res = await app.request("/auth/device-trust/status", {
      headers: {
        Cookie: `opencode_session=${session.id}`,
      },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totpEnabled).toBe(true)
    expect(body.totpConfigured).toBe(true)
    expect(body.totpOptedOut).toBe(false)
    expect(body.twoFactorEnabled).toBe(true)
    expect(body.twoFactorConfigured).toBe(true)
    expect(body.twoFactorOptedOut).toBe(false)
    expect(body.deviceTrusted).toBe(false)
    UserSession.remove(session.id)
  })

  test("returns disabled flags when totp is disabled", async () => {
    setMockAuthConfig({ enabled: true, method: "pam", twoFactorEnabled: false })

    const res = await app.request("/auth/device-trust/status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totpEnabled).toBe(false)
    expect(body.totpConfigured).toBe(false)
    expect(body.totpOptedOut).toBe(false)
    expect(body.twoFactorEnabled).toBe(false)
    expect(body.twoFactorConfigured).toBe(false)
    expect(body.twoFactorOptedOut).toBe(false)
    expect(body.deviceTrusted).toBe(false)
  })
})

describe("Bootstrap signup routes", () => {
  let app: Hono

  beforeEach(() => {
    mockAuthenticate.mockClear()
    mockGetUserInfo.mockClear()
    mockRegisterSession.mockClear()
    mockUnregisterSession.mockClear()
    mockCreateBootstrapUser.mockClear()
    mockGetBootstrapStatus.mockClear()
    mockVerifyBootstrapOtp.mockClear()
    mockCompleteBootstrapOtp.mockClear()
    mockListUserPasskeys.mockClear()
    mockCheckTotp.mockClear()
    mockBrokerPing.mockClear()

    mockGetBootstrapStatus.mockResolvedValue({ active: false, available: false })
    mockCreateBootstrapUser.mockResolvedValue({ ok: false, code: "inactive", message: "inactive", status: 403 })
    mockGetUserInfo.mockResolvedValue({
      username: "testuser",
      uid: 1000,
      gid: 1000,
      gecos: "Test User",
      home: "/home/testuser",
      shell: "/bin/bash",
    })
    mockListUserPasskeys.mockResolvedValue([])
    mockCheckTotp.mockResolvedValue(false)
    mockBrokerPing.mockResolvedValue(true)

    setMockAuthConfig({
      enabled: true,
      method: "pam",
      passkeysEnabled: true,
    })
    app = new Hono().route("/auth", AuthRoutes())
  })

  test("GET /auth/bootstrap/signup redirects to login without session", async () => {
    const res = await app.request("/auth/bootstrap/signup")
    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("/auth/login")
  })

  test("GET /auth/bootstrap/signup rejects non-bootstrap sessions", async () => {
    const session = UserSession.create("testuser", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/testuser",
      shell: "/bin/bash",
    })

    const res = await app.request("/auth/bootstrap/signup", {
      headers: {
        Cookie: `opencode_session=${session.id}`,
      },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("/")
    UserSession.remove(session.id)
  })

  test("GET /auth/bootstrap/signup returns html for valid bootstrap session", async () => {
    const session = UserSession.create("opencoder", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/opencoder",
      shell: "/bin/bash",
    })
    UserSession.setBootstrapPending(session.id, "otp-token")

    const res = await app.request("/auth/bootstrap/signup", {
      headers: {
        Cookie: `opencode_session=${session.id}`,
      },
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_BOOTSTRAP_SIGNUP__")
    expect(html).toContain('"passkeySetupUrl":"/auth/passkey/setup?required=1&returnTo=%2F"')
    UserSession.remove(session.id)
  })

  test("POST /auth/bootstrap/signup rejects requests without X-Requested-With header", async () => {
    const session = UserSession.create("opencoder", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/opencoder",
      shell: "/bin/bash",
    })
    UserSession.setBootstrapPending(session.id, "otp-token")

    const res = await app.request("/auth/bootstrap/signup", {
      method: "POST",
      headers: {
        Cookie: `opencode_session=${session.id}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: "alice", password: "Password123!" }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("csrf_missing")
    UserSession.remove(session.id)
  })

  test("POST /auth/bootstrap/signup propagates bootstrap helper errors", async () => {
    const session = UserSession.create("opencoder", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/opencoder",
      shell: "/bin/bash",
    })
    UserSession.setBootstrapPending(session.id, "otp-token")
    mockCreateBootstrapUser.mockResolvedValue({
      ok: false,
      code: "invalid_password",
      message: "Password must be at least 12 characters and include 3 of 4 classes.",
      status: 400,
    })

    const res = await app.request("/auth/bootstrap/signup", {
      method: "POST",
      headers: {
        Cookie: `opencode_session=${session.id}`,
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "alice", password: "weak" }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("invalid_password")
    expect(body.message).toContain("Password")
    UserSession.remove(session.id)
  })

  test("POST /auth/bootstrap/signup creates a new session and removes old bootstrap session", async () => {
    const session = UserSession.create("opencoder", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/opencoder",
      shell: "/bin/bash",
    })
    UserSession.setBootstrapPending(session.id, "otp-token")
    mockCreateBootstrapUser.mockResolvedValue({ ok: true, username: "alice" })
    mockGetUserInfo.mockResolvedValue({
      username: "alice",
      uid: 1001,
      gid: 1001,
      gecos: "Alice",
      home: "/home/alice",
      shell: "/bin/bash",
    })

    const res = await app.request("/auth/bootstrap/signup", {
      method: "POST",
      headers: {
        Cookie: `opencode_session=${session.id}`,
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "alice", password: "StrongPassword123!" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.redirectTo).toBe("/")
    expect(body.user.username).toBe("alice")

    expect(UserSession.get(session.id)).toBeUndefined()

    const cookie = res.headers.get("Set-Cookie")
    expect(cookie).toContain("opencode_session=")
    const match = cookie?.match(/opencode_session=([^;]+)/)
    expect(match).toBeDefined()
    const newSession = match ? UserSession.get(match[1]) : undefined
    expect(newSession?.username).toBe("alice")
  })

  test("GET /auth/passkey/setup includes bootstrap signup url only when bootstrap is pending", async () => {
    const bootstrapSession = UserSession.create("opencoder", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/opencoder",
      shell: "/bin/bash",
    })
    UserSession.setBootstrapPending(bootstrapSession.id, "otp-token")

    const normalSession = UserSession.create("testuser", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/testuser",
      shell: "/bin/bash",
    })

    const bootstrapRes = await app.request("/auth/passkey/setup?required=1", {
      headers: {
        Cookie: `opencode_session=${bootstrapSession.id}`,
      },
    })
    expect(bootstrapRes.status).toBe(200)
    const bootstrapHtml = await bootstrapRes.text()
    expect(bootstrapHtml).toContain('"bootstrapSignupUrl":"/auth/bootstrap/signup?returnTo=%2F"')

    const normalRes = await app.request("/auth/passkey/setup", {
      headers: {
        Cookie: `opencode_session=${normalSession.id}`,
      },
    })
    expect(normalRes.status).toBe(200)
    const normalHtml = await normalRes.text()
    expect(normalHtml).not.toContain('"bootstrapSignupUrl"')

    UserSession.remove(bootstrapSession.id)
    UserSession.remove(normalSession.id)
  })
})

describe("POST /auth/totp/setup/start", () => {
  let app: Hono

  beforeEach(() => {
    setMockAuthConfig({ enabled: true, method: "pam", twoFactorEnabled: true })
    mockCheckTotp.mockClear()
    mockBrokerPing.mockClear()
    mockCheckTotp.mockResolvedValue(false)
    mockBrokerPing.mockResolvedValue(true)
    app = new Hono().route("/auth", AuthRoutes())
  })

  test("returns 401 without authenticated session", async () => {
    const res = await app.request("/auth/totp/setup/start", {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    })

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe("not_authenticated")
  })

  test("legacy /auth/2fa/setup/start alias remains supported", async () => {
    const res = await app.request("/auth/2fa/setup/start", {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    })

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe("not_authenticated")
  })

  test("returns 400 when X-Requested-With is missing", async () => {
    const session = UserSession.create("testuser", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/testuser",
      shell: "/bin/bash",
    })
    const csrfToken = generateCSRFToken(session.id, getCSRFSecret())

    const res = await app.request("/auth/totp/setup/start", {
      method: "POST",
      headers: {
        Cookie: `opencode_session=${session.id}`,
        "X-CSRF-Token": csrfToken,
      },
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("csrf_missing")
    UserSession.remove(session.id)
  })

  test("returns 403 when CSRF token is invalid", async () => {
    const session = UserSession.create("testuser", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/testuser",
      shell: "/bin/bash",
    })

    const res = await app.request("/auth/totp/setup/start", {
      method: "POST",
      headers: {
        Cookie: `opencode_session=${session.id}`,
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": "invalid-token",
      },
    })

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("csrf_invalid")
    UserSession.remove(session.id)
  })

  test("returns setup bootstrap payload for valid authenticated request", async () => {
    const session = UserSession.create("testuser", "test-agent", {
      uid: 1000,
      gid: 1000,
      home: "/home/testuser",
      shell: "/bin/bash",
    })
    const csrfToken = generateCSRFToken(session.id, getCSRFSecret())

    const res = await app.request("/auth/totp/setup/start", {
      method: "POST",
      headers: {
        Cookie: `opencode_session=${session.id}`,
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": csrfToken,
      },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.username).toBe("testuser")
    expect(typeof body.secret).toBe("string")
    expect(typeof body.qrCodeSvg).toBe("string")
    expect(typeof body.setupStatus).toBe("string")
    expect(typeof body.setupMessage).toBe("string")
    expect(body.alreadyConfigured).toBe(false)

    const storedSession = UserSession.get(session.id)
    expect(storedSession?.totpSetupSecret).toBe(body.secret)
    expect(storedSession?.twoFactorSetupSecret).toBe(body.secret)
    UserSession.remove(session.id)
  })
})

describe("Passkey routes", () => {
  let app: Hono

  beforeEach(() => {
    mockAuthenticate.mockClear()
    mockGetUserInfo.mockClear()
    mockCreatePasskeyAuthenticationOptions.mockClear()
    mockVerifyPasskeyAuthentication.mockClear()
    mockCreatePasskeyRegistrationOptions.mockClear()
    mockVerifyPasskeyRegistration.mockClear()
    mockListUserPasskeys.mockClear()
    mockRemoveUserPasskey.mockClear()
    mockCheckTotp.mockClear()
    mockBrokerPing.mockClear()

    mockGetUserInfo.mockResolvedValue({
      username: "testuser",
      uid: 1000,
      gid: 1000,
      gecos: "Test User",
      home: "/home/testuser",
      shell: "/bin/bash",
    })
    mockCreatePasskeyAuthenticationOptions.mockResolvedValue({
      options: { challenge: "challenge", rpId: "localhost" },
      challengeToken: "challenge-token",
    })
    mockVerifyPasskeyAuthentication.mockResolvedValue({ verified: false, error: "failed" })
    mockCreatePasskeyRegistrationOptions.mockResolvedValue({
      options: { challenge: "registration-challenge" },
      challengeToken: "registration-token",
    })
    mockVerifyPasskeyRegistration.mockResolvedValue({ verified: false, error: "failed" })
    mockListUserPasskeys.mockResolvedValue([])
    mockRemoveUserPasskey.mockResolvedValue(false)
    mockCheckTotp.mockResolvedValue(false)
    mockBrokerPing.mockResolvedValue(true)

    setMockAuthConfig({
      enabled: true,
      method: "pam",
      passkeysEnabled: true,
    })

    app = new Hono().route("/auth", AuthRoutes())
  })

  test("POST /auth/passkey/auth/options returns 403 when passkeys are disabled", async () => {
    setMockAuthConfig({
      enabled: true,
      passkeysEnabled: false,
    })

    const res = await app.request("https://example.com/auth/passkey/auth/options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe("passkeys_disabled")
  })

  test("POST /auth/passkey/auth/options returns challenge options when enabled", async () => {
    const res = await app.request("https://example.com/auth/passkey/auth/options", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.challengeToken).toBe("challenge-token")
  })

  test("POST /auth/passkey/auth/options accepts proxied HTTPS when trustProxy is auto in managed env", async () => {
    setMockAuthConfig({
      enabled: true,
      passkeysEnabled: true,
      trustProxy: "auto",
    })

    await withRailwayEnv(async () => {
      const res = await app.request("http://example.com/auth/passkey/auth/options", {
        method: "POST",
        headers: {
          Host: "example.com",
          "X-Forwarded-Proto": "https",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
    })
  })

  test("POST /auth/passkey/auth/options accepts secure-context hint as tie-breaker in managed env", async () => {
    setMockAuthConfig({
      enabled: true,
      passkeysEnabled: true,
      trustProxy: "auto",
    })

    await withRailwayEnv(async () => {
      const res = await app.request("http://example.com/auth/passkey/auth/options", {
        method: "POST",
        headers: {
          Host: "example.com",
          Origin: "https://example.com",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-Opencode-Secure-Context": "1",
          "X-Opencode-Window-Origin": "https://example.com",
        },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
    })
  })

  test("POST /auth/passkey/auth/options rejects invalid secure-context hint", async () => {
    setMockAuthConfig({
      enabled: true,
      passkeysEnabled: true,
      trustProxy: "auto",
    })

    await withRailwayEnv(async () => {
      const res = await app.request("http://example.com/auth/passkey/auth/options", {
        method: "POST",
        headers: {
          Host: "example.com",
          Origin: "https://evil.example.com",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-Opencode-Secure-Context": "1",
          "X-Opencode-Window-Origin": "https://evil.example.com",
        },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe("passkey_requires_https")
    })
  })

  test("POST /auth/passkey/auth/options keeps HTTP blocked when trustProxy auto is not in managed env", async () => {
    setMockAuthConfig({
      enabled: true,
      passkeysEnabled: true,
      trustProxy: "auto",
    })

    const previous = process.env.RAILWAY_ENVIRONMENT
    delete process.env.RAILWAY_ENVIRONMENT
    try {
      const res = await app.request("http://example.com/auth/passkey/auth/options", {
        method: "POST",
        headers: {
          Host: "example.com",
          "X-Forwarded-Proto": "https",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe("passkey_requires_https")
    } finally {
      if (previous !== undefined) {
        process.env.RAILWAY_ENVIRONMENT = previous
      }
    }
  })

  test("POST /auth/passkey/auth/verify creates a session on success", async () => {
    mockVerifyPasskeyAuthentication.mockResolvedValue({
      verified: true,
      username: "testuser",
    })

    const res = await app.request("https://example.com/auth/passkey/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        challengeToken: "challenge-token",
        response: { id: "credential-id" },
      }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.user.username).toBe("testuser")
    expect(res.headers.get("Set-Cookie")).toContain("opencode_session=")
  })

  test("POST /auth/passkey/auth/verify returns 401 for invalid challenge", async () => {
    mockVerifyPasskeyAuthentication.mockResolvedValue({
      verified: false,
      error: "invalid_challenge",
    })

    const res = await app.request("https://example.com/auth/passkey/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        challengeToken: "expired",
        response: { id: "credential-id" },
      }),
    })

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe("token_expired")
  })

  test("POST /auth/passkey/register/options uses https origin behind managed proxy in auto mode", async () => {
    setMockAuthConfig({
      enabled: true,
      passkeysEnabled: true,
      trustProxy: "auto",
    })

    const authed = new Hono()
    authed.use("/auth/passkey/*", async (c, next) => {
      c.set("session", {
        id: "session-id",
        username: "testuser",
        uid: 1000,
        gid: 1000,
        home: "/home/testuser",
        shell: "/bin/bash",
        createdAt: Date.now(),
        lastAccessTime: Date.now(),
      })
      return next()
    })
    authed.route("/auth", AuthRoutes())

    await withRailwayEnv(async () => {
      const res = await authed.request("http://example.com/auth/passkey/register/options", {
        method: "POST",
        headers: {
          Host: "example.com",
          "X-Forwarded-Proto": "https",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
      const call = mockCreatePasskeyRegistrationOptions.mock.calls.at(-1)?.[0] as { origins?: string[] } | undefined
      expect(call?.origins).toEqual(["https://example.com"])
    })
  })

  test("GET /auth/passkey/list requires an authenticated session", async () => {
    const res = await app.request("/auth/passkey/list")
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe("not_authenticated")
  })

  test("GET /auth/passkey/list returns passkeys for authenticated session", async () => {
    const authed = new Hono()
    authed.use("/auth/passkey/*", async (c, next) => {
      c.set("session", {
        id: "session-id",
        username: "testuser",
        uid: 1000,
        gid: 1000,
        home: "/home/testuser",
        shell: "/bin/bash",
        createdAt: Date.now(),
        lastAccessTime: Date.now(),
      })
      return next()
    })
    authed.route("/auth", AuthRoutes())

    mockListUserPasskeys.mockResolvedValue([
      {
        credentialId: "cred-1",
        deviceLabel: "MacBook Touch ID",
        createdAt: 1,
        lastUsedAt: 2,
        transports: ["internal"],
        aaguid: "aaguid-1",
      },
    ])

    const res = await authed.request("/auth/passkey/list")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.credentials).toHaveLength(1)
    expect(body.credentials[0].credentialId).toBe("cred-1")
  })

  test("POST /auth/passkey/remove returns 404 when credential is missing", async () => {
    const authed = new Hono()
    authed.use("/auth/passkey/*", async (c, next) => {
      c.set("session", {
        id: "session-id",
        username: "testuser",
        uid: 1000,
        gid: 1000,
        home: "/home/testuser",
        shell: "/bin/bash",
        createdAt: Date.now(),
        lastAccessTime: Date.now(),
      })
      return next()
    })
    authed.route("/auth", AuthRoutes())

    mockRemoveUserPasskey.mockResolvedValue(false)

    const res = await authed.request("/auth/passkey/remove", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ credentialId: "missing-id" }),
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("not_found")
  })
})

describe("Rate limiting", () => {
  let app: Hono

  beforeEach(() => {
    mockAuthenticate.mockClear()
    mockGetUserInfo.mockClear()
    mockAuthenticate.mockResolvedValue({ success: false, error: "Invalid credentials" })
    mockGetUserInfo.mockResolvedValue({
      username: "testuser",
      uid: 1000,
      gid: 1000,
      gecos: "Test User",
      home: "/home/testuser",
      shell: "/bin/bash",
    })
  })

  test("rate limiting config is respected", async () => {
    // Note: Testing exact rate limit behavior is challenging due to lazy initialization
    // and shared state. This test verifies the config is properly read.
    setMockAuthConfig({
      enabled: true,
      method: "pam",
      rateLimiting: true,
      rateLimitWindow: "15m",
      rateLimitMax: 5,
    })

    app = new Hono().route("/auth", AuthRoutes())

    // Verify rate limiter doesn't break normal requests
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-Forwarded-For": "192.168.99.1",
      },
      body: JSON.stringify({ username: "test", password: "wrong" }),
    })
    // Should fail auth, not rate limit (under limit)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe("auth_failed")
  })

  test("rate limiting is skipped when disabled", async () => {
    setMockAuthConfig({
      enabled: true,
      method: "pam",
      rateLimiting: false,
    })

    app = new Hono().route("/auth", AuthRoutes())

    const headers = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Forwarded-For": "192.168.1.test2",
    }

    // Make many requests - none should be rate limited
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: "test", password: "wrong" }),
      })
      expect(res.status).toBe(401) // Auth fails, but not rate limited
    }
  })

  test("rate limiting is skipped when auth disabled", async () => {
    setMockAuthConfig({ enabled: false })

    app = new Hono().route("/auth", AuthRoutes())

    const headers = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Forwarded-For": "192.168.1.test3",
    }

    // Should return 403 (auth disabled), not rate limited
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username: "test", password: "wrong" }),
      })
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe("auth_disabled")
    }
  })
})

describe("Security event logging", () => {
  let app: Hono
  let logCalls: Array<{ level: string; message: string; data: any }> = []

  beforeEach(() => {
    logCalls = []
    mockAuthenticate.mockClear()
    mockGetUserInfo.mockClear()
    mockAuthenticate.mockResolvedValue({ success: false, error: "Invalid credentials" })
    mockGetUserInfo.mockResolvedValue({
      username: "testuser",
      uid: 1000,
      gid: 1000,
      gecos: "Test User",
      home: "/home/testuser",
      shell: "/bin/bash",
    })
    setMockAuthConfig({ enabled: true, method: "pam" })
    app = new Hono().route("/auth", AuthRoutes())
  })

  test("logs security event on failed login", async () => {
    mockAuthenticate.mockResolvedValue({ success: false, error: "Invalid credentials" })

    await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-Forwarded-For": "192.168.1.100",
        "User-Agent": "TestAgent/1.0",
      },
      body: JSON.stringify({ username: "testuser", password: "wrong" }),
    })

    // Log is called but we can't easily intercept it without additional mocking
    // This test verifies the code path doesn't throw
  })

  test("logs security event on successful login", async () => {
    mockAuthenticate.mockResolvedValue({ success: true })

    await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-Forwarded-For": "192.168.1.100",
        "User-Agent": "TestAgent/1.0",
      },
      body: JSON.stringify({ username: "testuser", password: "correct" }),
    })

    // Log is called but we can't easily intercept it without additional mocking
    // This test verifies the code path doesn't throw
  })

  test("logs security event on CSRF violation", async () => {
    await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Missing X-Requested-With header
        "X-Forwarded-For": "192.168.1.100",
        "User-Agent": "TestAgent/1.0",
      },
      body: JSON.stringify({ username: "testuser", password: "pass" }),
    })

    // Log is called but we can't easily intercept it without additional mocking
    // This test verifies the code path doesn't throw
  })
})

describe("HTTPS detection and enforcement", () => {
  let app: Hono

  beforeEach(() => {
    mockAuthenticate.mockClear()
    mockGetUserInfo.mockClear()
    mockAuthenticate.mockResolvedValue({ success: true })
    mockGetUserInfo.mockResolvedValue({
      username: "testuser",
      uid: 1000,
      gid: 1000,
      gecos: "Test User",
      home: "/home/testuser",
      shell: "/bin/bash",
    })
  })

  test("GET /login returns warning HTML when requireHttps is warn and HTTP", async () => {
    setMockAuthConfig({ requireHttps: "warn" })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "GET",
      headers: { Host: "example.com" },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":false')
    expect(html).not.toContain('"shouldWarn":')
  })

  test("GET /login returns blocked HTML when requireHttps is block and HTTP", async () => {
    setMockAuthConfig({ requireHttps: "block" })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "GET",
      headers: { Host: "example.com" },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":true')
  })

  test("GET /login returns normal HTML for secure connection", async () => {
    setMockAuthConfig({ requireHttps: "block", trustProxy: true })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "GET",
      headers: { Host: "example.com", "X-Forwarded-Proto": "https" },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":false')
  })

  test("GET /login returns normal HTML for localhost over HTTP", async () => {
    setMockAuthConfig({ requireHttps: "block" })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://localhost:4096/auth/login", {
      method: "GET",
      headers: { Host: "localhost:4096" },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":false')
  })

  test("POST /login returns 403 when requireHttps is block and HTTP", async () => {
    setMockAuthConfig({ requireHttps: "block", trustProxy: false })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "POST",
      headers: {
        Host: "example.com",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct" }),
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe("https_required")
  })

  test("POST /login succeeds for localhost even in block mode", async () => {
    setMockAuthConfig({ requireHttps: "block", trustProxy: false })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://localhost:4096/auth/login", {
      method: "POST",
      headers: {
        Host: "localhost:4096",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ username: "testuser", password: "correct" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test("respects X-Forwarded-Proto when trustProxy is true", async () => {
    setMockAuthConfig({ requireHttps: "warn", trustProxy: true })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "GET",
      headers: {
        Host: "example.com",
        "X-Forwarded-Proto": "https",
      },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":false')
  })

  test("respects multi-value X-Forwarded-Proto when trustProxy is true", async () => {
    setMockAuthConfig({ requireHttps: "warn", trustProxy: true })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "GET",
      headers: {
        Host: "example.com",
        "X-Forwarded-Proto": "https, http",
      },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":false')
  })

  test("respects Forwarded proto when trustProxy is true", async () => {
    setMockAuthConfig({ requireHttps: "warn", trustProxy: true })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "GET",
      headers: {
        Host: "example.com",
        Forwarded: "proto=https;host=example.com",
      },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":false')
  })

  test("ignores X-Forwarded-Proto when trustProxy is false", async () => {
    setMockAuthConfig({ requireHttps: "warn", trustProxy: false })
    app = new Hono().route("/auth", AuthRoutes())

    const res = await app.request("http://example.com/auth/login", {
      method: "GET",
      headers: {
        Host: "example.com",
        "X-Forwarded-Proto": "https",
      },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("window.__OPENCODE_LOGIN__")
    expect(html).toContain('"shouldBlock":false')
    expect(html).not.toContain('"shouldWarn":')
  })
})
