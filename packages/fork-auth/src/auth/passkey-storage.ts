import z from "zod"
import { Storage } from "../../../opencode/src/storage/storage"

export const PasskeyCredential = z.object({
  credentialId: z.string().min(1),
  publicKey: z.string().min(1),
  counter: z.number().int().nonnegative(),
  transports: z.array(z.string()).optional(),
  aaguid: z.string().optional(),
  deviceLabel: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().optional(),
})

const PasskeyState = z.object({
  credentials: z.array(PasskeyCredential).default([]),
  updatedAt: z.number().int().nonnegative().optional(),
})

export type PasskeyCredential = z.infer<typeof PasskeyCredential>

function key(username: string) {
  return ["auth", "passkey", "credential", username]
}

function normalize(input: unknown) {
  const parsed = PasskeyState.safeParse(input)
  if (!parsed.success) {
    return {
      credentials: [] as PasskeyCredential[],
    }
  }
  return {
    credentials: parsed.data.credentials ?? [],
  }
}

export async function listPasskeyCredentials(username: string): Promise<PasskeyCredential[]> {
  try {
    const stored = await Storage.read<unknown>(key(username))
    return normalize(stored).credentials
  } catch (error) {
    if (error instanceof Storage.NotFoundError) return []
    throw error
  }
}

export async function findPasskeyCredential(username: string, credentialId: string): Promise<PasskeyCredential | null> {
  const list = await listPasskeyCredentials(username)
  return list.find((item) => item.credentialId === credentialId) ?? null
}

export async function findPasskeyByCredentialId(
  credentialId: string,
): Promise<{ username: string; credential: PasskeyCredential } | null> {
  const keys = await Storage.list(["auth", "passkey", "credential"])
  for (const item of keys) {
    const username = item[item.length - 1]
    if (!username) continue
    const credential = await findPasskeyCredential(username, credentialId)
    if (!credential) continue
    return { username, credential }
  }
  return null
}

export async function upsertPasskeyCredential(
  username: string,
  credential: PasskeyCredential,
): Promise<PasskeyCredential[]> {
  const list = await listPasskeyCredentials(username)
  const next = list.filter((item) => item.credentialId !== credential.credentialId)
  next.push(credential)
  await Storage.write(key(username), {
    credentials: next,
    updatedAt: Date.now(),
  })
  return next
}

export async function removePasskeyCredential(username: string, credentialId: string): Promise<boolean> {
  const list = await listPasskeyCredentials(username)
  const next = list.filter((item) => item.credentialId !== credentialId)
  if (next.length === list.length) return false
  await Storage.write(key(username), {
    credentials: next,
    updatedAt: Date.now(),
  })
  return true
}
