import { describe, expect, test } from "bun:test"
import path from "path"
import { Server } from "opencode/server/server"
import { AuthConfig } from "opencode/config/auth"
import { ServerAuth } from "opencode/config/server-auth"

const projectRoot = path.join(__dirname, "../..")

describe("config precedence guard", () => {
  test("inline auth override avoids PAM-related 500s in app request flow", async () => {
    const originalInlineConfig = process.env["OPENCODE_CONFIG_CONTENT"]
    process.env["OPENCODE_CONFIG_CONTENT"] = JSON.stringify({
      auth: { enabled: false },
    })

    try {
      ServerAuth._setForTesting(AuthConfig.parse({ enabled: false }))
      try {
        const app = Server.App()
        const response = await app.request(`/tui/select-session?directory=${encodeURIComponent(projectRoot)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: "invalid_session_id" }),
        })

        expect(response.status).toBe(400)
      } finally {
        ServerAuth._reset()
      }
    } finally {
      if (originalInlineConfig === undefined) {
        delete process.env["OPENCODE_CONFIG_CONTENT"]
      } else {
        process.env["OPENCODE_CONFIG_CONTENT"] = originalInlineConfig
      }
    }
  })
})
