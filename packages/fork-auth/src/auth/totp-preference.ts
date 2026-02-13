import z from "zod"
import { Storage } from "../../../opencode/src/storage/storage"

const preferenceSchema = z.object({
  skipSetup: z.boolean().optional(),
  updatedAt: z.number().optional(),
})

export type TotpPreference = z.infer<typeof preferenceSchema>

/** @deprecated Prefer TotpPreference. */
export type TwoFactorPreference = TotpPreference

const defaultPreference: TotpPreference = {
  skipSetup: false,
}

const CANONICAL_PREFERENCE_PATH_PREFIX = ["auth", "totp", "preference"]
const LEGACY_PREFERENCE_PATH_PREFIX = ["auth", "2fa", "preference"]

function normalizePreference(input: unknown): TotpPreference {
  const parsed = preferenceSchema.safeParse(input)
  if (!parsed.success) return { ...defaultPreference }
  return {
    skipSetup: parsed.data.skipSetup ?? false,
    updatedAt: parsed.data.updatedAt,
  }
}

export async function getTotpPreference(username: string): Promise<TotpPreference> {
  const canonicalPath = [...CANONICAL_PREFERENCE_PATH_PREFIX, username]
  const legacyPath = [...LEGACY_PREFERENCE_PATH_PREFIX, username]

  try {
    const stored = await Storage.read<TotpPreference>(canonicalPath)
    return normalizePreference(stored)
  } catch (err) {
    if (!(err instanceof Storage.NotFoundError)) throw err
  }

  try {
    const stored = await Storage.read<TotpPreference>(legacyPath)
    return normalizePreference(stored)
  } catch (err) {
    if (err instanceof Storage.NotFoundError) return { ...defaultPreference }
    throw err
  }
}

export async function setTotpPreference(username: string, next: TotpPreference): Promise<void> {
  const canonicalPath = [...CANONICAL_PREFERENCE_PATH_PREFIX, username]
  const legacyPath = [...LEGACY_PREFERENCE_PATH_PREFIX, username]
  const normalized = normalizePreference(next)
  const payload = {
    ...normalized,
    updatedAt: Date.now(),
  }
  await Storage.write(canonicalPath, payload)
  // Keep legacy key in sync for older clients still reading auth/2fa preference.
  await Storage.write(legacyPath, payload)
}

/** @deprecated Use getTotpPreference. */
export const getTwoFactorPreference = getTotpPreference

/** @deprecated Use setTotpPreference. */
export const setTwoFactorPreference = setTotpPreference
