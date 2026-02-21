import { expect, test } from "bun:test"
import { Hono } from "hono"

const { AuthRoutes } = await import("../../../src/server/routes/auth")

test("AuthRoutes mounts and responds", async () => {
  const app = new Hono().route("/auth", AuthRoutes())
  const res = await app.request("/auth/unknown")
  expect([404, 405]).toContain(res.status)
})
