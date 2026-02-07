import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { consumePasskeyChallengeToken, createPasskeyChallengeToken } from "./passkey-challenge"
import {
  findPasskeyByCredentialId,
  findPasskeyCredential,
  listPasskeyCredentials,
  removePasskeyCredential,
  type PasskeyCredential,
  upsertPasskeyCredential,
} from "./passkey-storage"

type SimpleWebAuthnServerModule = typeof import("@simplewebauthn/server")

let simpleWebAuthnServerPromise: Promise<SimpleWebAuthnServerModule> | undefined

async function loadSimpleWebAuthnServer(): Promise<SimpleWebAuthnServerModule> {
  if (!simpleWebAuthnServerPromise) {
    simpleWebAuthnServerPromise = (async () => {
      await import("reflect-metadata")
      return import("@simplewebauthn/server")
    })().catch((error) => {
      simpleWebAuthnServerPromise = undefined
      throw error
    })
  }
  return simpleWebAuthnServerPromise
}

const TRANSPORTS = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
])

type PasskeyCommonInput = {
  rpID: string
  origins: string[]
  timeoutSeconds: number
  requireUserVerification: boolean
  secret: Uint8Array
  ip?: string
}

export type PasskeyAuthOptions = {
  options: PublicKeyCredentialRequestOptionsJSON
  challengeToken: string
}

export type PasskeyRegisterOptions = {
  options: PublicKeyCredentialCreationOptionsJSON
  challengeToken: string
}

function sanitizeLabel(input: string | undefined): string | undefined {
  const value = input?.trim()
  if (!value) return undefined
  if (value.length > 64) return value.slice(0, 64)
  return value
}

function defaultLabel() {
  return `Passkey ${new Date().toISOString().slice(0, 10)}`
}

function normalizeTransports(input: string[] | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!input?.length) return undefined
  const list = input.filter((item): item is AuthenticatorTransportFuture =>
    TRANSPORTS.has(item as AuthenticatorTransportFuture),
  )
  return list.length ? list : undefined
}

function extractCredentialId(input: AuthenticationResponseJSON | RegistrationResponseJSON): string | undefined {
  if (!input || typeof input !== "object") return undefined
  return typeof input.id === "string" && input.id.length > 0 ? input.id : undefined
}

function extractUserHandle(input: AuthenticationResponseJSON): string | undefined {
  const value = input.response?.userHandle
  if (!value) return undefined
  try {
    const username = Buffer.from(value, "base64url").toString("utf8").trim()
    if (!username) return undefined
    return username
  } catch {
    return undefined
  }
}

export async function createPasskeyAuthenticationOptions(
  input: PasskeyCommonInput & {
    username?: string
    timeoutMs: number
  },
): Promise<PasskeyAuthOptions> {
  const { generateAuthenticationOptions } = await loadSimpleWebAuthnServer()
  const credentials = input.username ? await listPasskeyCredentials(input.username) : []
  const options = await generateAuthenticationOptions({
    rpID: input.rpID,
    timeout: input.timeoutMs,
    userVerification: input.requireUserVerification ? "required" : "preferred",
    allowCredentials: credentials.length
      ? credentials.map((item) => ({
          id: item.credentialId,
          transports: normalizeTransports(item.transports),
        }))
      : undefined,
  })

  const challengeToken = await createPasskeyChallengeToken({
    purpose: "auth",
    challenge: options.challenge,
    rpID: input.rpID,
    origins: input.origins,
    username: input.username,
    ip: input.ip,
    timeoutSeconds: input.timeoutSeconds,
    secret: input.secret,
  })

  return {
    options,
    challengeToken,
  }
}

export async function verifyPasskeyAuthentication(
  input: PasskeyCommonInput & {
    challengeToken: string
    response: AuthenticationResponseJSON
  },
): Promise<{
  verified: boolean
  username?: string
  error?: "invalid_challenge" | "invalid_response" | "unknown_credential" | "counter" | "failed"
}> {
  const { verifyAuthenticationResponse } = await loadSimpleWebAuthnServer()
  const challenge = await consumePasskeyChallengeToken({
    token: input.challengeToken,
    purpose: "auth",
    secret: input.secret,
    ip: input.ip,
  })
  if (!challenge) return { verified: false, error: "invalid_challenge" }

  const credentialId = extractCredentialId(input.response)
  if (!credentialId) return { verified: false, error: "invalid_response" }

  const preferred = challenge.username
    ? {
        username: challenge.username,
        credential: await findPasskeyCredential(challenge.username, credentialId),
      }
    : null

  const fallback = !preferred?.credential ? await findPasskeyByCredentialId(credentialId) : null
  const byHandleUsername = !preferred?.credential && !fallback ? extractUserHandle(input.response) : undefined
  const byHandleCredential = byHandleUsername ? await findPasskeyCredential(byHandleUsername, credentialId) : null

  const matched = preferred?.credential
    ? { username: preferred.username, credential: preferred.credential }
    : fallback
      ? fallback
      : byHandleCredential && byHandleUsername
        ? { username: byHandleUsername, credential: byHandleCredential }
        : null

  if (!matched) return { verified: false, error: "unknown_credential" }

  try {
    const verified = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origins,
      expectedRPID: challenge.rpID,
      credential: {
        id: matched.credential.credentialId,
        publicKey: Buffer.from(matched.credential.publicKey, "base64url"),
        counter: matched.credential.counter,
        transports: normalizeTransports(matched.credential.transports),
      },
      requireUserVerification: input.requireUserVerification,
    })

    if (!verified.verified) return { verified: false, error: "failed" }

    await upsertPasskeyCredential(matched.username, {
      ...matched.credential,
      counter: verified.authenticationInfo.newCounter,
      lastUsedAt: Date.now(),
    })

    return {
      verified: true,
      username: matched.username,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ""
    if (message.includes("counter")) {
      return { verified: false, error: "counter" }
    }
    return { verified: false, error: "failed" }
  }
}

export async function createPasskeyRegistrationOptions(
  input: PasskeyCommonInput & {
    username: string
    rpName: string
    timeoutMs: number
  },
): Promise<PasskeyRegisterOptions> {
  const { generateRegistrationOptions } = await loadSimpleWebAuthnServer()
  const credentials = await listPasskeyCredentials(input.username)
  const options = await generateRegistrationOptions({
    rpName: input.rpName,
    rpID: input.rpID,
    userName: input.username,
    userID: Buffer.from(input.username, "utf8"),
    timeout: input.timeoutMs,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: input.requireUserVerification ? "required" : "preferred",
    },
    excludeCredentials: credentials.map((item) => ({
      id: item.credentialId,
      transports: normalizeTransports(item.transports),
    })),
  })

  const challengeToken = await createPasskeyChallengeToken({
    purpose: "register",
    challenge: options.challenge,
    rpID: input.rpID,
    origins: input.origins,
    username: input.username,
    ip: input.ip,
    timeoutSeconds: input.timeoutSeconds,
    secret: input.secret,
  })

  return {
    options,
    challengeToken,
  }
}

export async function verifyPasskeyRegistration(
  input: PasskeyCommonInput & {
    username: string
    challengeToken: string
    response: RegistrationResponseJSON
    deviceLabel?: string
  },
): Promise<{
  verified: boolean
  credential?: PasskeyCredential
  error?: "invalid_challenge" | "invalid_response" | "failed"
}> {
  const { verifyRegistrationResponse } = await loadSimpleWebAuthnServer()
  const challenge = await consumePasskeyChallengeToken({
    token: input.challengeToken,
    purpose: "register",
    secret: input.secret,
    ip: input.ip,
  })
  if (!challenge) return { verified: false, error: "invalid_challenge" }
  if (challenge.username && challenge.username !== input.username)
    return { verified: false, error: "invalid_challenge" }

  const credentialId = extractCredentialId(input.response)
  if (!credentialId) return { verified: false, error: "invalid_response" }

  try {
    const verified = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origins,
      expectedRPID: challenge.rpID,
      requireUserVerification: input.requireUserVerification,
    })

    if (!verified.verified || !verified.registrationInfo) {
      return { verified: false, error: "failed" }
    }

    const existing = await findPasskeyCredential(input.username, credentialId)
    const now = Date.now()
    const credential: PasskeyCredential = {
      credentialId,
      publicKey: Buffer.from(verified.registrationInfo.credential.publicKey).toString("base64url"),
      counter: verified.registrationInfo.credential.counter,
      transports: input.response.response.transports,
      aaguid: verified.registrationInfo.aaguid,
      deviceLabel: sanitizeLabel(input.deviceLabel) ?? existing?.deviceLabel ?? defaultLabel(),
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: existing?.lastUsedAt,
    }

    await upsertPasskeyCredential(input.username, credential)

    return {
      verified: true,
      credential,
    }
  } catch {
    return { verified: false, error: "failed" }
  }
}

export async function listUserPasskeys(username: string) {
  return listPasskeyCredentials(username)
}

export async function removeUserPasskey(username: string, credentialId: string) {
  return removePasskeyCredential(username, credentialId)
}
