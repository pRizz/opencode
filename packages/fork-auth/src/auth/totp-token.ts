import { SignJWT, jwtVerify, type JWTPayload } from "jose"

/**
 * TOTP token payload - issued after password success, consumed by OTP validation.
 * Contains user info needed to create session after successful TOTP.
 */
interface TotpTokenPayload extends JWTPayload {
  /** Username */
  sub: string
  /** UNIX user ID */
  uid: number
  /** UNIX group ID */
  gid: number
  /** Home directory */
  home: string
  /** Login shell */
  shell: string
  /** IP address of requester (for binding) */
  ip?: string
}

/**
 * User info needed for session creation after TOTP.
 */
export interface TotpUserInfo {
  username: string
  uid: number
  gid: number
  home: string
  shell: string
}

/** @deprecated Prefer TotpUserInfo. */
export type TwoFactorUserInfo = TotpUserInfo

/**
 * Create a short-lived TOTP token after password validation.
 *
 * @param userInfo - User info from password auth
 * @param timeoutSeconds - Token validity (default 5 minutes = 300 seconds)
 * @param secret - Signing secret
 * @param ip - Optional IP address for binding
 */
export async function createTotpToken(
  userInfo: TotpUserInfo,
  timeoutSeconds: number,
  secret: Uint8Array,
  ip?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    sub: userInfo.username,
    uid: userInfo.uid,
    gid: userInfo.gid,
    home: userInfo.home,
    shell: userInfo.shell,
    ip,
  } as TotpTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + timeoutSeconds)
    .sign(secret)
}

/**
 * Verify a TOTP token and extract user info.
 *
 * @param token - The JWT token to verify
 * @param secret - Signing secret
 * @param expectedIp - Optional IP to verify against
 * @returns User info if valid, null if invalid/expired
 */
export async function verifyTotpToken(
  token: string,
  secret: Uint8Array,
  expectedIp?: string,
): Promise<TotpUserInfo | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    const totpPayload = payload as TotpTokenPayload

    // If IP binding is expected, verify it matches
    if (expectedIp && totpPayload.ip && totpPayload.ip !== expectedIp) {
      return null
    }

    // Validate required fields
    if (
      !totpPayload.sub ||
      totpPayload.uid === undefined ||
      totpPayload.gid === undefined ||
      !totpPayload.home ||
      !totpPayload.shell
    ) {
      return null
    }

    return {
      username: totpPayload.sub,
      uid: totpPayload.uid,
      gid: totpPayload.gid,
      home: totpPayload.home,
      shell: totpPayload.shell,
    }
  } catch {
    return null
  }
}

/**
 * @deprecated Use createTotpToken.
 */
export const create2FAToken = createTotpToken

/**
 * @deprecated Use verifyTotpToken.
 */
export const verify2FAToken = verifyTotpToken

/**
 * Calculate remaining seconds until token expiration.
 * Returns 0 if token is invalid or expired.
 */
export function getTokenRemainingSeconds(token: string): number {
  try {
    // Decode without verification to get exp claim
    const [, payloadBase64] = token.split(".")
    if (!payloadBase64) return 0

    const payload = JSON.parse(atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")))
    const exp = payload.exp as number | undefined
    if (!exp) return 0

    const now = Math.floor(Date.now() / 1000)
    const remaining = exp - now
    return remaining > 0 ? remaining : 0
  } catch {
    return 0
  }
}
