import { describe, expect, test } from "bun:test"
import { getClientIP } from "../../opencode/src/server/security/rate-limit"

function createContext(env: unknown) {
  return {
    env,
    req: {
      raw: new Request("http://localhost/login"),
      header: () => undefined,
    },
  }
}

describe("getClientIP", () => {
  test("calls env.requestIP with the env object as receiver", () => {
    const env = {
      requestIP(this: unknown) {
        if (this !== env) {
          throw new TypeError("requestIP lost receiver")
        }
        return { address: "203.0.113.10" }
      },
    }

    expect(getClientIP(createContext(env) as Parameters<typeof getClientIP>[0])).toBe("203.0.113.10")
  })

  test("calls server.requestIP with the server object as receiver", () => {
    const server = {
      requestIP(this: unknown) {
        if (this !== server) {
          throw new TypeError("requestIP lost receiver")
        }
        return "203.0.113.20"
      },
    }

    expect(getClientIP(createContext({ server }) as Parameters<typeof getClientIP>[0])).toBe("203.0.113.20")
  })

  test("falls back to server.requestIP when env.requestIP throws", () => {
    const server = {
      requestIP() {
        return { address: "203.0.113.30" }
      },
    }
    const env = {
      requestIP() {
        throw new TypeError("Expected this to be instanceof DebugHTTPServer")
      },
      server,
    }

    expect(getClientIP(createContext(env) as Parameters<typeof getClientIP>[0])).toBe("203.0.113.30")
  })
})
