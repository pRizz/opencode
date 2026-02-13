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

function normalizePreference(input: unknown): TotpPreference {
  const parsed = preferenceSchema.safeParse(input)
  if (!parsed.success) return { ...defaultPreference }
  return {
    skipSetup: parsed.data.skipSetup ?? false,
    updatedAt: parsed.data.updatedAt,
  }
}

export async function getTotpPreference(username: string): Promise<TotpPreference> {
  try {
    const stored = await Storage.read<TotpPreference>(["auth", "2fa", "preference", username])
    return normalizePreference(stored)
  } catch (err) {
    if (err instanceof Storage.NotFoundError) return { ...defaultPreference }
    throw err
  }
}

export async function setTotpPreference(username: string, next: TotpPreference): Promise<void> {
  const normalized = normalizePreference(next)
  await Storage.write(["auth", "2fa", "preference", username], {
    ...normalized,
    updatedAt: Date.now(),
  })
}

/** @deprecated Use getTotpPreference. */
export const getTwoFactorPreference = getTotpPreference

/** @deprecated Use setTotpPreference. */
export const setTwoFactorPreference = setTotpPreference
