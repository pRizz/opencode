import type { Context, Env, Input } from "hono"
import { getEffectiveProto, type TrustProxySetting } from "./request-context"

/**
 * Check if the current request is from localhost.
 */
export function isLocalhost<E extends Env = Env, P extends string = string, I extends Input = Input>(
  c: Context<E, P, I>,
): boolean {
  const host = c.req.header("Host") ?? ""

  // Check for localhost variations with or without port
  if (host === "localhost" || host.startsWith("localhost:")) return true
  if (host === "127.0.0.1" || host.startsWith("127.0.0.1:")) return true
  if (host === "::1" || host.startsWith("::1:")) return true
  if (host === "[::1]" || host.startsWith("[::1]:")) return true

  return false
}

/**
 * Check if the current connection is secure (HTTPS).
 *
 * Supports explicit trustProxy=true/false and trustProxy="auto".
 * Auto mode trusts forwarded protocol only in managed proxy environments.
 * Falls back to direct connection protocol check.
 */
export function isSecureConnection<E extends Env = Env, P extends string = string, I extends Input = Input>(
  c: Context<E, P, I>,
  trustProxy: TrustProxySetting,
): boolean {
  return getEffectiveProto(c, trustProxy) === "https"
}

/**
 * Determine if insecure login should be blocked based on configuration.
 *
 * Returns true if:
 * - requireHttps is 'block'
 * - Connection is not localhost
 * - Connection is not secure
 */
export function shouldBlockInsecureLogin<E extends Env = Env, P extends string = string, I extends Input = Input>(
  c: Context<E, P, I>,
  config: { requireHttps: "off" | "warn" | "block"; trustProxy?: TrustProxySetting },
): boolean {
  // Never block if requireHttps is off
  if (config.requireHttps === "off") return false

  // Never block localhost (allow dev over HTTP)
  if (isLocalhost(c)) return false

  // Never block if connection is secure
  if (isSecureConnection(c, config.trustProxy)) return false

  // Block if requireHttps is 'block'
  return config.requireHttps === "block"
}

/**
 * Get comprehensive connection security information for login page.
 */
export function getConnectionSecurityInfo<E extends Env = Env, P extends string = string, I extends Input = Input>(
  c: Context<E, P, I>,
  config: { requireHttps: "off" | "warn" | "block"; trustProxy?: TrustProxySetting },
): {
  isSecure: boolean
  isLocalhost: boolean
  shouldBlock: boolean
  shouldWarn: boolean
} {
  const localhost = isLocalhost(c)
  const secure = isSecureConnection(c, config.trustProxy)
  const shouldBlock = shouldBlockInsecureLogin(c, config)

  // Should warn when: not secure AND not localhost AND requireHttps is 'warn'
  const shouldWarn = !secure && !localhost && config.requireHttps === "warn"

  return {
    isSecure: secure,
    isLocalhost: localhost,
    shouldBlock,
    shouldWarn,
  }
}
