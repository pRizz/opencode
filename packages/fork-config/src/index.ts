import z from "zod"
import path from "node:path"
import type { Filesystem } from "../../../opencode/src/util/filesystem"
import type { Config } from "../../../opencode/src/config/config"
import { validateAuthConfig } from "@opencode-ai/fork-auth"
import { AuthConfig } from "@opencode-ai/fork-auth/config"

export function extendForkServerConfig<T extends z.ZodTypeAny>(server: T): T {
  if (!(server instanceof z.ZodObject)) return server

  return server.extend({
    uiUrl: z
      .string()
      .url()
      .optional()
      .describe("Base URL for the web UI proxy (defaults to https://app.opencode.ai)"),
  }) as T
}

export function extendForkInfoConfig<T extends z.ZodTypeAny>(info: T): T {
  if (!(info instanceof z.ZodObject)) return info

  return info.extend({
    workspace: z
      .object({
        root: z.string().optional().describe("Workspace root for cloning repositories"),
      })
      .optional(),
    auth: AuthConfig.optional().describe("Authentication configuration for multi-user access"),
  }) as T
}

export function applyForkConfigDefaults(result: Config.Info, opts: { home: string }): void {
  result.workspace = result.workspace || {}
  if (!result.workspace.root) {
    result.workspace.root = path.join(opts.home, "opencode")
  }
}

export async function validateForkConfig(args: {
  auth: Config.Info["auth"]
  filesystem: Filesystem
  log: { info: (message: string, data?: unknown) => void }
  onMissingPam: (input: { service: string; path: string }) => Error
}): Promise<void> {
  await validateAuthConfig({
    auth: args.auth,
    filesystem: args.filesystem,
    log: args.log,
    onMissingPam: args.onMissingPam,
  })
}
