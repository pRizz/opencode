import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { Hono } from "hono"
import { csrfMiddleware, setCSRFCookie, clearCSRFCookie } from "opencode/server/middleware/csrf"
import { getCookie } from "hono/cookie"
import { ServerAuth } from "opencode/config/server-auth"
import type { AuthConfig } from "opencode/config/auth"
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCSRFToken,
  getCSRFSecret,
} from "opencode/server/security/csrf"

// Type for test context with sessionId variable
type TestEnv = { Variables: { sessionId: string } }

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

describe("CSRF middleware", () => {
  let app: Hono<TestEnv>

  // Mock ServerAuth.get() to return test config
  let mockAuthConfig: AuthConfig
  const originalGet = ServerAuth.get

  beforeEach(() => {
    // Reset app for each test
    app = new Hono<TestEnv>()

    // Default auth config: enabled with CSRF
    mockAuthConfig = {
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
      twoFactorEnabled: false,
      twoFactorTokenTimeout: "5m",
      deviceTrustDuration: "30d",
      otpRateLimitMax: 5,
      otpRateLimitWindow: "15m",
      twoFactorRequired: false,
      trustProxy: "auto",
    }

    // Mock ServerAuth.get
    ServerAuth.get = mock(() => mockAuthConfig)
  })

  afterEach(() => {
    // Restore original
    ServerAuth.get = originalGet
  })

  describe("Safe methods (GET, HEAD, OPTIONS)", () => {
    it("allows GET requests without CSRF token", async () => {
      app.use(csrfMiddleware)
      app.get("/test", (c) => c.json({ success: true }))

      const res = await app.request("/test", { method: "GET" })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it("allows HEAD requests without CSRF token", async () => {
      app.use(csrfMiddleware)
      app.all("/test", (c) => c.text(""))

      const res = await app.request("/test", { method: "HEAD" })

      expect(res.status).toBe(200)
    })

    it("allows OPTIONS requests without CSRF token", async () => {
      app.use(csrfMiddleware)
      app.all("/test", (c) => c.text(""))

      const res = await app.request("/test", { method: "OPTIONS" })

      expect(res.status).toBe(200)
    })
  })

  describe("Auth disabled", () => {
    it("allows POST requests when auth is disabled", async () => {
      mockAuthConfig.enabled = false

      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "test" }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })
  })

  describe("Allowlist", () => {
    it("allows /auth/login without CSRF validation", async () => {
      app.use(csrfMiddleware)
      app.post("/auth/login", (c) => c.json({ success: true }))

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "test", password: "test" }),
      })

      expect(res.status).toBe(200)
    })

    it("allows /auth/status without CSRF validation", async () => {
      app.use(csrfMiddleware)
      app.get("/auth/status", (c) => c.json({ enabled: true }))

      const res = await app.request("/auth/status", { method: "GET" })

      expect(res.status).toBe(200)
    })

    it("allows /auth/passkey/auth/options without CSRF validation", async () => {
      app.use(csrfMiddleware)
      app.post("/auth/passkey/auth/options", (c) => c.json({ success: true }))

      const res = await app.request("/auth/passkey/auth/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)
    })

    it("allows /auth/passkey/auth/verify without CSRF validation", async () => {
      app.use(csrfMiddleware)
      app.post("/auth/passkey/auth/verify", (c) => c.json({ success: true }))

      const res = await app.request("/auth/passkey/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)
    })

    it("allows custom allowlist routes", async () => {
      mockAuthConfig.csrfAllowlist = ["/api/webhook"]

      app.use(csrfMiddleware)
      app.post("/api/webhook", (c) => c.json({ success: true }))

      const res = await app.request("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "test" }),
      })

      expect(res.status).toBe(200)
    })
  })

  describe("CSRF validation", () => {
    it("returns 403 when CSRF cookie is missing", async () => {
      app.use((c, next) => {
        c.set("sessionId", "test-session")
        return next()
      })
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      const res = await app.request("/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "test" }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe("csrf_required")
    })

    it("returns 403 when CSRF request token is missing", async () => {
      app.use((c, next) => {
        c.set("sessionId", "test-session")
        return next()
      })
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      const res = await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=test-token`,
        },
        body: JSON.stringify({ data: "test" }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe("csrf_invalid")
    })

    it("returns 403 when tokens do not match", async () => {
      app.use((c, next) => {
        c.set("sessionId", "test-session")
        return next()
      })
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      const res = await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=cookie-token`,
          [CSRF_HEADER_NAME]: "different-token",
        },
        body: JSON.stringify({ data: "test" }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe("csrf_invalid")
    })

    it("returns 403 when HMAC signature is invalid", async () => {
      app.use((c, next) => {
        c.set("sessionId", "test-session")
        return next()
      })
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      // Token with matching cookie/header but invalid HMAC
      const invalidToken = "invalid-signature.random-value-here"

      const res = await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=${invalidToken}`,
          [CSRF_HEADER_NAME]: invalidToken,
        },
        body: JSON.stringify({ data: "test" }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe("csrf_invalid")
    })

    it("allows valid CSRF token from header", async () => {
      const sessionId = "test-session"

      // Simulate setting CSRF cookie via helper
      let csrfToken = ""
      app.use((c, next) => {
        c.set("sessionId", sessionId)
        setCSRFCookie(c, sessionId)
        // Extract token from response for testing
        const cookie = c.res.headers.get("Set-Cookie")
        if (cookie) {
          const match = cookie.match(/opencode_csrf=([^;]+)/)
          if (match) csrfToken = match[1]
        }
        return next()
      })
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      // First request sets the cookie
      await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ data: "test" }),
      })

      // Now make actual request with valid token
      const res = await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ data: "test" }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it("allows valid CSRF token from body._csrf field", async () => {
      const sessionId = "test-session"

      let csrfToken = ""
      app.use((c, next) => {
        c.set("sessionId", sessionId)
        setCSRFCookie(c, sessionId)
        const cookie = c.res.headers.get("Set-Cookie")
        if (cookie) {
          const match = cookie.match(/opencode_csrf=([^;]+)/)
          if (match) csrfToken = match[1]
        }
        return next()
      })
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      // First request sets cookie
      await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        body: JSON.stringify({ data: "test", _csrf: csrfToken }),
      })

      // Actual request with token in body
      const res = await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        body: JSON.stringify({ data: "test", _csrf: csrfToken }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it("returns 403 when sessionId is missing from context", async () => {
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      const res = await app.request("/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${CSRF_COOKIE_NAME}=token`,
          [CSRF_HEADER_NAME]: "token",
        },
        body: JSON.stringify({ data: "test" }),
      })

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe("csrf_invalid")
    })
  })

  describe("setCSRFCookie", () => {
    it("sets CSRF cookie with correct attributes", async () => {
      const sessionId = "test-session"

      app.get("/test", (c) => {
        setCSRFCookie(c, sessionId)
        return c.json({ success: true })
      })

      const res = await app.request("/test")

      const setCookieHeader = res.headers.get("Set-Cookie")
      expect(setCookieHeader).toBeTruthy()
      expect(setCookieHeader).toContain(CSRF_COOKIE_NAME)
      expect(setCookieHeader).toContain("Path=/")
      expect(setCookieHeader).toContain("SameSite=Lax")
      // httpOnly should NOT be set (required for double-submit)
      expect(setCookieHeader).not.toContain("HttpOnly")
    })

    it("sets Secure flag on HTTPS", async () => {
      const sessionId = "test-session"

      app.get("/test", (c) => {
        setCSRFCookie(c, sessionId)
        return c.json({ success: true })
      })

      const res = await app.request("https://example.com/test")

      const setCookieHeader = res.headers.get("Set-Cookie")
      expect(setCookieHeader).toContain("Secure")
    })

    it("sets Secure flag for proxied HTTPS when trustProxy is auto in managed env", async () => {
      const sessionId = "test-session"
      mockAuthConfig.trustProxy = "auto"

      app.get("/test", (c) => {
        setCSRFCookie(c, sessionId)
        return c.json({ success: true })
      })

      await withRailwayEnv(async () => {
        const res = await app.request("http://example.com/test", {
          headers: {
            Host: "example.com",
            "X-Forwarded-Proto": "https",
          },
        })
        const setCookieHeader = res.headers.get("Set-Cookie")
        expect(setCookieHeader).toContain("Secure")
      })
    })

    it("does not set Secure flag on spoofed forwarded proto outside managed env", async () => {
      const sessionId = "test-session"
      mockAuthConfig.trustProxy = "auto"

      app.get("/test", (c) => {
        setCSRFCookie(c, sessionId)
        return c.json({ success: true })
      })

      const previous = process.env.RAILWAY_ENVIRONMENT
      delete process.env.RAILWAY_ENVIRONMENT
      try {
        const res = await app.request("http://example.com/test", {
          headers: {
            Host: "example.com",
            "X-Forwarded-Proto": "https",
          },
        })
        const setCookieHeader = res.headers.get("Set-Cookie")
        expect(setCookieHeader).not.toContain("Secure")
      } finally {
        if (previous !== undefined) {
          process.env.RAILWAY_ENVIRONMENT = previous
        }
      }
    })

    it("sets Secure on CSRF backfill cookie for proxied HTTPS in managed env", async () => {
      const sessionId = "test-session"
      mockAuthConfig.trustProxy = "auto"

      app.use((c, next) => {
        c.set("sessionId", sessionId)
        return next()
      })
      app.use(csrfMiddleware)
      app.post("/test", (c) => c.json({ success: true }))

      const csrfToken = generateCSRFToken(sessionId, getCSRFSecret())

      await withRailwayEnv(async () => {
        const res = await app.request("http://example.com/test", {
          method: "POST",
          headers: {
            Host: "example.com",
            "Content-Type": "application/json",
            "X-Forwarded-Proto": "https",
            [CSRF_HEADER_NAME]: csrfToken,
          },
          body: JSON.stringify({ data: "test" }),
        })

        expect(res.status).toBe(200)
        const setCookieHeader = res.headers.get("Set-Cookie")
        expect(setCookieHeader).toContain(CSRF_COOKIE_NAME)
        expect(setCookieHeader).toContain("Secure")
      })
    })
  })

  describe("clearCSRFCookie", () => {
    it("clears CSRF cookie", async () => {
      app.get("/test", (c) => {
        clearCSRFCookie(c)
        return c.json({ success: true })
      })

      const res = await app.request("/test")

      const setCookieHeader = res.headers.get("Set-Cookie")
      expect(setCookieHeader).toBeTruthy()
      expect(setCookieHeader).toContain(CSRF_COOKIE_NAME)
      // Should have Max-Age=0 or Expires in past to delete
      expect(setCookieHeader).toMatch(/Max-Age=0|Expires=/)
    })
  })
})
