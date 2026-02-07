import { SignJWT, jwtVerify } from "jose"

export type PasskeyChallengePurpose = "auth" | "register"

export type PasskeyChallengePayload = {
  typ: `passkey_${PasskeyChallengePurpose}`
  challenge: string
  rpID: string
  origins: string[]
  username?: string
  ip?: string
}

const used = new Map<string, number>()

function prune(now: number) {
  for (const [jti, expiry] of used.entries()) {
    if (expiry <= now) used.delete(jti)
  }
}

export async function createPasskeyChallengeToken(input: {
  purpose: PasskeyChallengePurpose
  challenge: string
  rpID: string
  origins: string[]
  username?: string
  ip?: string
  timeoutSeconds: number
  secret: Uint8Array
}) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + input.timeoutSeconds

  return new SignJWT({
    typ: `passkey_${input.purpose}`,
    challenge: input.challenge,
    rpID: input.rpID,
    origins: input.origins,
    username: input.username,
    ip: input.ip,
  } satisfies PasskeyChallengePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(crypto.randomUUID())
    .sign(input.secret)
}

export async function consumePasskeyChallengeToken(input: {
  token: string
  purpose: PasskeyChallengePurpose
  secret: Uint8Array
  ip?: string
}): Promise<PasskeyChallengePayload | null> {
  prune(Date.now())

  try {
    const result = await jwtVerify(input.token, input.secret)
    const payload = result.payload as PasskeyChallengePayload & {
      jti?: string
      exp?: number
    }

    if (payload.typ !== `passkey_${input.purpose}`) return null
    if (!Array.isArray(payload.origins) || payload.origins.length === 0) return null
    if (!payload.challenge || !payload.rpID) return null
    if (payload.ip && input.ip && payload.ip !== input.ip) return null

    const jti = payload.jti
    const exp = payload.exp
    if (!jti || !exp) return null

    if (used.has(jti)) return null
    used.set(jti, exp * 1000)

    return {
      typ: payload.typ,
      challenge: payload.challenge,
      rpID: payload.rpID,
      origins: payload.origins,
      username: payload.username,
      ip: payload.ip,
    }
  } catch {
    return null
  }
}
