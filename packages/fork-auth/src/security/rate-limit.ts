import { rateLimiter } from "hono-rate-limiter"
import type { Context } from "hono"
import { Log } from "../../../opencode/src/util/log"

const log = Log.create({ service: "rate-limit" })

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  windowMs?: number // default: 15 * 60 * 1000 (15 min)
  limit?: number // default: 5
  trustProxy?: boolean
  keyGenerator?: (c: Context) => string
}

/**
 * Simple in-memory rate limit store.
 * Tracks failed attempts per key with automatic cleanup of expired entries.
 */
interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * Manual rate limiter for tracking failed attempts only.
 *
 * Usage:
 * 1. Call `checkRateLimit()` before processing - returns error response if limited
 * 2. Call `recordFailure()` after a failed attempt to increment counter
 * 3. Successful attempts don't need any action (counter not incremented)
 */
export interface ManualRateLimiter {
  /**
   * Check if the key is rate limited.
   * @returns Error response if rate limited, undefined if allowed
   */
  checkRateLimit: (c: Context) => Response | undefined

  /**
   * Record a failed attempt for the key.
   */
  recordFailure: (c: Context) => void
}

/**
 * Create a manual rate limiter that only counts failures.
 *
 * @param config - Rate limit configuration
 * @returns Manual rate limiter with check and record functions
 */
export function createManualRateLimiter(config?: RateLimitConfig): ManualRateLimiter {
  const windowMs = config?.windowMs ?? 15 * 60 * 1000 // 15 minutes
  const limit = config?.limit ?? 5
  const keyGenerator = config?.keyGenerator ?? ((c: Context) => getClientIP(c, config?.trustProxy ?? false))
  const failureStore = new Map<string, RateLimitEntry>()

  // Keep counters scoped to this limiter instance to avoid cross-route interference.
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of failureStore) {
      if (now >= entry.resetAt) {
        failureStore.delete(key)
      }
    }
  }, 5 * 60 * 1000)

  if (
    typeof cleanupTimer === "object" &&
    cleanupTimer &&
    "unref" in cleanupTimer &&
    typeof cleanupTimer.unref === "function"
  ) {
    cleanupTimer.unref()
  }

  return {
    checkRateLimit: (c: Context): Response | undefined => {
      const key = keyGenerator(c)
      const now = Date.now()
      const entry = failureStore.get(key)

      // No entry or expired - allowed
      if (!entry || now >= entry.resetAt) {
        return undefined
      }

      // Under limit - allowed
      if (entry.count < limit) {
        return undefined
      }

      // Rate limited
      const ip = keyGenerator(c)
      const timestamp = new Date().toISOString()

      log.warn("[SECURITY] Rate limit exceeded", {
        ip,
        timestamp,
        user_agent: c.req.header("User-Agent"),
        failures: entry.count,
      })

      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)

      return c.json(
        {
          error: "rate_limit_exceeded",
          message: "Too many failed attempts. Please try again later.",
        },
        429,
        {
          "Retry-After": retryAfterSeconds.toString(),
        },
      ) as unknown as Response
    },

    recordFailure: (c: Context): void => {
      const key = keyGenerator(c)
      const now = Date.now()
      const entry = failureStore.get(key)

      if (!entry || now >= entry.resetAt) {
        // Start new window
        failureStore.set(key, {
          count: 1,
          resetAt: now + windowMs,
        })
      } else {
        // Increment existing
        entry.count++
      }
    },
  }
}

/**
 * Extract client IP address from request headers.
 *
 * With trustProxy=false (default), forwarded headers are ignored to avoid spoofing.
 * With trustProxy=true, checks X-Forwarded-For then X-Real-IP before direct socket IP.
 */
export function getClientIP(c: Context, trustProxy = false): string {
  if (trustProxy) {
    // Check X-Forwarded-For (comma-separated list, take first)
    const xForwardedFor = c.req.header("X-Forwarded-For")
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0].trim()
      if (firstIp) return firstIp
    }

    // Fall back to X-Real-IP
    const xRealIp = c.req.header("X-Real-IP")
    if (xRealIp) return xRealIp
  }

  const directIp = getDirectSocketIP(c)
  if (directIp) return directIp

  // Fall back to unknown
  return "unknown"
}

function getDirectSocketIP(c: Context): string | undefined {
  const env = c.env as unknown as {
    requestIP?: (request: Request) => unknown
    server?: {
      requestIP?: (request: Request) => unknown
    }
  }

  const fromEnv = requestIPFromTarget(env, c.req.raw)
  if (fromEnv) return fromEnv

  const fromServer = requestIPFromTarget(env?.server, c.req.raw)
  if (fromServer) return fromServer

  return undefined
}

function requestIPFromTarget(target: unknown, request: Request): string | undefined {
  if (!target || typeof target !== "object") return undefined
  const requestIP = (target as { requestIP?: (request: Request) => unknown }).requestIP
  if (typeof requestIP !== "function") return undefined

  const value = requestIP(request)
  if (!value) return undefined

  if (typeof value === "string") {
    return value.trim() || undefined
  }

  if (typeof value === "object") {
    const address = (value as { address?: unknown }).address
    if (typeof address === "string" && address.trim()) {
      return address.trim()
    }
  }

  return undefined
}

/**
 * Create a rate limiter for the login endpoint.
 *
 * Limits failed login attempts per IP address to prevent brute force attacks.
 * Only counts failed attempts (status >= 400) - successful logins don't count.
 * Returns 429 with Retry-After header when limit is exceeded.
 *
 * @param config - Rate limit configuration
 * @returns Rate limiter middleware
 */
export function createLoginRateLimiter(config?: RateLimitConfig) {
  const windowMs = config?.windowMs ?? 15 * 60 * 1000 // 15 minutes
  const limit = config?.limit ?? 5
  const keyGenerator = config?.keyGenerator ?? ((c: Context) => getClientIP(c, config?.trustProxy ?? false))

  return rateLimiter({
    windowMs,
    limit,
    standardHeaders: "draft-7", // Return rate limit info in headers
    keyGenerator,
    skipSuccessfulRequests: true, // Only count failed attempts (status >= 400)
    handler: (c) => {
      const ip = keyGenerator(c)
      const timestamp = new Date().toISOString()

      // Log security event
      log.warn("[SECURITY] Login rate limit exceeded", {
        ip,
        timestamp,
        user_agent: c.req.header("User-Agent"),
      })

      // Set Retry-After header (in seconds)
      const retryAfterSeconds = Math.ceil(windowMs / 1000)

      // Return 429 with error message and Retry-After header
      return c.json(
        {
          error: "rate_limit_exceeded",
          message: "Too many login attempts. Please try again later.",
        },
        429,
        {
          "Retry-After": retryAfterSeconds.toString(),
        },
      )
    },
  })
}

/**
 * Create a rate limiter for OTP validation that only counts failed attempts.
 *
 * Unlike the login rate limiter, this only increments the counter when
 * the request fails (status >= 400). Successful OTP validations don't
 * count against the limit.
 *
 * @param config - Rate limit configuration
 * @returns Rate limiter middleware
 */
export function createOtpRateLimiter(config?: RateLimitConfig) {
  const windowMs = config?.windowMs ?? 15 * 60 * 1000 // 15 minutes
  const limit = config?.limit ?? 5
  const keyGenerator = config?.keyGenerator ?? ((c: Context) => getClientIP(c, config?.trustProxy ?? false))

  return rateLimiter({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    keyGenerator,
    skipSuccessfulRequests: true, // Only count failed attempts (status >= 400)
    handler: (c) => {
      const ip = keyGenerator(c)
      const timestamp = new Date().toISOString()

      log.warn("[SECURITY] OTP rate limit exceeded", {
        ip,
        timestamp,
        user_agent: c.req.header("User-Agent"),
      })

      const retryAfterSeconds = Math.ceil(windowMs / 1000)

      return c.json(
        {
          error: "rate_limit_exceeded",
          message: "Too many verification attempts. Please try again later.",
        },
        429,
        {
          "Retry-After": retryAfterSeconds.toString(),
        },
      )
    },
  })
}
