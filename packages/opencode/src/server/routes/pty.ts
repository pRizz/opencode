import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import { upgradeWebSocket } from "hono/bun"
import z from "zod"
import { Pty } from "@/pty"
import { Storage } from "../../storage/storage"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { type AuthEnv } from "../middleware/auth"
import { ServerAuth } from "@/config/server-auth"
import { Log } from "@/util/log"
import {
  createPtyRequestId,
  getPtyErrorMessage,
  mapPtyCreateError,
  maybeHandleAuthPtyCreate,
  maybeRequirePtyAuth,
  resolvePtyConnectRequestId,
} from "@opencode-ai/fork-terminal/pty-auth-hook"

const log = Log.create({ service: "pty-routes" })

type PtyEnv = AuthEnv & {
  Variables: AuthEnv["Variables"] & {
    ptyRequestId?: string
  }
}

export const PtyRoutes = lazy(() =>
  new Hono<PtyEnv>()
    .get(
      "/",
      describeRoute({
        summary: "List PTY sessions",
        description: "Get a list of all active pseudo-terminal (PTY) sessions managed by OpenCode.",
        operationId: "pty.list",
        responses: {
          200: {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: resolver(Pty.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(Pty.list())
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create PTY session",
        description: "Create a new pseudo-terminal (PTY) session for running shell commands and processes.",
        operationId: "pty.create",
        responses: {
          200: {
            description: "Created session",
            content: {
              "application/json": {
                schema: resolver(Pty.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Pty.CreateInput),
      async (c) => {
        const requestId = createPtyRequestId()
        const authConfig = ServerAuth.get()
        const input = c.req.valid("json")

        const authResponse = await maybeHandleAuthPtyCreate({
          c,
          requestId,
          authEnabled: authConfig.enabled,
          input,
          createPty: (createInput, sessionId, nextRequestId) => Pty.create(createInput, sessionId, nextRequestId),
          mapCreateError: mapPtyCreateError,
          getErrorMessage: getPtyErrorMessage,
          log,
        })

        if (authResponse) {
          return authResponse
        }

        // Auth disabled - use existing behavior
        try {
          const info = await Pty.create(input, undefined, requestId)
          log.info("pty created", { requestId, ptyId: info.id })
          return c.json(info)
        } catch (error) {
          const message = getPtyErrorMessage(error)
          const mapped = mapPtyCreateError(error, message)
          log.warn("pty create failed", { requestId, code: mapped.code, error: message })
          return c.json({ error: message, code: mapped.code, requestId }, mapped.status)
        }
      },
    )
    .get(
      "/:ptyID",
      describeRoute({
        summary: "Get PTY session",
        description: "Retrieve detailed information about a specific pseudo-terminal (PTY) session.",
        operationId: "pty.get",
        responses: {
          200: {
            description: "Session info",
            content: {
              "application/json": {
                schema: resolver(Pty.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      async (c) => {
        const info = Pty.get(c.req.valid("param").ptyID)
        if (!info) {
          throw new Storage.NotFoundError({ message: "Session not found" })
        }
        return c.json(info)
      },
    )
    .put(
      "/:ptyID",
      describeRoute({
        summary: "Update PTY session",
        description: "Update properties of an existing pseudo-terminal (PTY) session.",
        operationId: "pty.update",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Pty.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      validator("json", Pty.UpdateInput),
      async (c) => {
        const authConfig = ServerAuth.get()

        const authResponse = maybeRequirePtyAuth(c, authConfig.enabled)
        if (authResponse) return authResponse

        const info = await Pty.update(c.req.valid("param").ptyID, c.req.valid("json"))
        return c.json(info)
      },
    )
    .delete(
      "/:ptyID",
      describeRoute({
        summary: "Remove PTY session",
        description: "Remove and terminate a specific pseudo-terminal (PTY) session.",
        operationId: "pty.remove",
        responses: {
          200: {
            description: "Session removed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      async (c) => {
        const authConfig = ServerAuth.get()

        const authResponse = maybeRequirePtyAuth(c, authConfig.enabled)
        if (authResponse) return authResponse
        // Note: Future improvement could verify PTY belongs to this user's session

        await Pty.remove(c.req.valid("param").ptyID)
        return c.json(true)
      },
    )
    .get(
      "/:ptyID/connect",
      describeRoute({
        summary: "Connect to PTY session",
        description: "Establish a WebSocket connection to interact with a pseudo-terminal (PTY) session in real-time.",
        operationId: "pty.connect",
        responses: {
          200: {
            description: "Connected session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ ptyID: z.string() })),
      async (c, next) => {
        const authConfig = ServerAuth.get()
        const authResponse = maybeRequirePtyAuth(c, authConfig.enabled)
        if (authResponse) return authResponse
        const requestId = resolvePtyConnectRequestId(c)
        const ptyId = c.req.param("ptyID")
        if (!Pty.get(ptyId)) {
          log.warn("pty connect session not found", { requestId, ptyId, code: "pty_session_not_found" })
          return c.json({ error: "Session not found", code: "pty_session_not_found", requestId }, 404)
        }
        return next()
      },
      upgradeWebSocket((c) => {
        const requestId = c.get("ptyRequestId") as string | undefined
        const id = c.req.param("ptyID")
        let handler: ReturnType<typeof Pty.connect>
        return {
          onOpen(_event, ws) {
            log.info("pty websocket opened", { requestId, ptyId: id })
            handler = Pty.connect(id, ws, { requestId })
          },
          onMessage(event) {
            handler?.onMessage(String(event.data))
          },
          onClose() {
            log.info("pty websocket closed", { requestId, ptyId: id })
            handler?.onClose()
          },
        }
      }),
    ),
)
