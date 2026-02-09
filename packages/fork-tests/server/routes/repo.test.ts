import { describe, test, expect } from "bun:test"

const { RepoRoutes } = await import("@opencode-ai/fork-auth/routes/repo")

describe("repo clone policy", () => {
  test("POST /repo/clone rejects HTTPS clone URLs", async () => {
    const app = RepoRoutes()

    const response = await app.request("/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://github.com/example/project.git",
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error?.code).toBe("https_clone_unsupported")
  })

  test("GET /repo/clone-progress emits clone_error with HTTPS unsupported code", async () => {
    const app = RepoRoutes()
    const url = encodeURIComponent("https://github.com/example/project.git")

    const response = await app.request(`/clone-progress?url=${url}`, {
      method: "GET",
    })

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain("event: clone_error")
    expect(text).toContain('"code":"https_clone_unsupported"')
  })

  test("POST /repo/clone-progress emits error event with HTTPS unsupported code", async () => {
    const app = RepoRoutes()

    const response = await app.request("/clone-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://github.com/example/project.git",
      }),
    })

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('"type":"error"')
    expect(text).toContain('"code":"https_clone_unsupported"')
  })
})
