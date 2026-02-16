import { test as base, expect, type Page } from "@playwright/test"
import { cleanupTestProject, createTestProject, seedProjects } from "./actions"
import { promptSelector } from "./selectors"
import { createSdk, dirSlug, getWorktree, sessionPath } from "./utils"

export const settingsKey = "settings.v3"

type TestFixtures = {
  sdk: ReturnType<typeof createSdk>
  gotoSession: (sessionID?: string) => Promise<void>
  withProject: <T>(
    callback: (project: {
      directory: string
      slug: string
      gotoSession: (sessionID?: string) => Promise<void>
    }) => Promise<T>,
    options?: { extra?: string[] },
  ) => Promise<T>
}

type WorkerFixtures = {
  directory: string
  slug: string
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  directory: [
    async ({}, use) => {
      const directory = await getWorktree()
      await use(directory)
    },
    { scope: "worker" },
  ],
  slug: [
    async ({ directory }, use) => {
      await use(dirSlug(directory))
    },
    { scope: "worker" },
  ],
  sdk: async ({ directory }, use) => {
    await use(createSdk(directory))
  },
  gotoSession: async ({ page, directory }, use) => {
    await seedStorage(page, { directory })

    const gotoSession = async (sessionID?: string) => {
      await page.goto(sessionPath(directory, sessionID))
      await expect(page.locator(promptSelector)).toBeVisible()
    }
    await use(gotoSession)
  },
  withProject: async ({ page }, use) => {
    await use(async (callback, options) => {
      const directory = await createTestProject()
      const slug = dirSlug(directory)
      await seedStorage(page, { directory, extra: options?.extra })

      const gotoSession = async (sessionID?: string) => {
        await page.goto(sessionPath(directory, sessionID))
        await expect(page.locator(promptSelector)).toBeVisible()
      }

      try {
        await gotoSession()
        return await callback({ directory, slug, gotoSession })
      } finally {
        await cleanupTestProject(directory)
      }
    })
  },
})

async function seedStorage(page: Page, input: { directory: string; extra?: string[] }) {
  const shouldCleanup = process.env.OPENCODE_E2E_CLEAN_SESSION_STATE === "1"

  await seedProjects(page, input)

  if (shouldCleanup) {
    await page.addInitScript(
      ({ directory, extra }) => {
        for (let index = localStorage.length - 1; index >= 0; index--) {
          const key = localStorage.key(index)
          if (!key) continue

          if (!key.startsWith("opencode.workspace.")) continue
          localStorage.removeItem(key)
        }

        const serverKey = "opencode.global.dat:server"
        const rawServer = localStorage.getItem(serverKey)
        if (!rawServer) return

        const store = (() => {
          try {
            return JSON.parse(rawServer) as Record<string, unknown>
          } catch {
            return undefined
          }
        })()
        if (!store || typeof store !== "object") return

        const allowed = new Set([directory, ...(extra ?? [])])
        const currentProjects = store.projects
        if (currentProjects && typeof currentProjects === "object" && !Array.isArray(currentProjects)) {
          const nextProjects: Record<string, unknown[]> = {}
          for (const [origin, rawValue] of Object.entries(currentProjects)) {
            if (!Array.isArray(rawValue)) continue
            const projects = rawValue
              .map((project) =>
                project && typeof project === "object" && typeof project.worktree === "string" ? project : undefined,
              )
              .filter(
                (project): project is { worktree: string } => project !== undefined && allowed.has(project.worktree),
              )
            if (projects.length > 0) nextProjects[origin] = projects
          }
          store.projects = nextProjects
        }

        const lastProject = store.lastProject
        if (lastProject && typeof lastProject === "object" && typeof lastProject.worktree === "string") {
          if (!allowed.has(lastProject.worktree)) {
            delete store.lastProject
          }
        }

        localStorage.setItem(serverKey, JSON.stringify(store))
      },
      { directory: input.directory, extra: input.extra ?? [] },
    )
  }

  await page.addInitScript(() => {
    localStorage.setItem(
      "opencode.global.dat:model",
      JSON.stringify({
        recent: [{ providerID: "opencode", modelID: "big-pickle" }],
        user: [],
        variant: {},
      }),
    )
  })
}

export { expect }
