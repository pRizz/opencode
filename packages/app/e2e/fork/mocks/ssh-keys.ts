import type { Page } from "@playwright/test"

interface MockSshKeyTime {
  created: number
  updated: number
}

interface MockSshKey {
  id: string
  name: string
  publicKey: string
  hosts: string[]
  fingerprint: string
  time: MockSshKeyTime
  installed?: {
    privateKeyPath: string
    publicKeyPath: string
    configPath: string
  }
}

interface MockSshKeysOptions {
  initialKeys?: MockSshKey[]
}

let keyCounter = 0

export function createMockSshKey(input: Partial<MockSshKey> = {}): MockSshKey {
  const host = input.hosts?.[0] ?? "github.com"
  const id = input.id ?? `ssh-key-${keyCounter++}`
  const name = input.name ?? `Mock key (${host})`
  const now = Date.now()

  return {
    id,
    name,
    publicKey: input.publicKey ?? `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMockGeneratedKey${id} ${name}`,
    hosts: input.hosts ?? [host],
    fingerprint: input.fingerprint ?? `SHA256:mock-fingerprint-${id}`,
    time: input.time ?? {
      created: now,
      updated: now,
    },
    installed: input.installed ?? {
      privateKeyPath: `/tmp/.ssh/opencode/opencode-${id}`,
      publicKeyPath: `/tmp/.ssh/opencode/opencode-${id}.pub`,
      configPath: "/tmp/.ssh/config",
    },
  }
}

export async function mockSshKeys(page: Page, options: MockSshKeysOptions = {}) {
  const keys = [...(options.initialKeys ?? [])]

  // Match both `/ssh-keys` and nested endpoints like `/ssh-keys/generate`.
  await page.route(/\/ssh-keys(?:\/[^/?#]+)?(?:\?.*)?$/, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname

    if (request.method() === "GET" && pathname.endsWith("/ssh-keys")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(keys),
      })
      return
    }

    if (request.method() === "POST" && pathname.endsWith("/ssh-keys/generate")) {
      let payload: unknown
      try {
        payload = request.postDataJSON()
      } catch {
        payload = undefined
      }

      const maybeInput =
        payload && typeof payload === "object" && "sshKeyGenerateInput" in payload
          ? (payload as { sshKeyGenerateInput?: unknown }).sshKeyGenerateInput
          : payload

      const input = (maybeInput ?? {}) as {
        hosts?: string[]
        name?: string
      }

      const host = Array.isArray(input.hosts) && input.hosts.length > 0 ? input.hosts[0] : "github.com"
      const name = input.name?.trim() || `Generated key (${host})`

      const key = createMockSshKey({
        hosts: [host],
        name,
      })

      keys.push(key)

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(key),
      })
      return
    }

    await route.continue()
  })
}
