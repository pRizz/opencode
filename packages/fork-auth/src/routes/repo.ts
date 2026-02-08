import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { Repo } from "../../../opencode/src/repo/repo"
import { errors } from "../../../opencode/src/server/error"
import { lazy } from "../../../opencode/src/util/lazy"
import { Log } from "../../../opencode/src/util/log"
import { getAuthContext } from "../middleware/auth"

const log = Log.create({ service: "repo-routes" })

const RepoError = Repo.CloneErrorInfo.extend({
  code: z.string().optional(),
  files: z.string().array().optional(),
}).meta({
  ref: "RepoError",
})

const RepoErrorResponse = z
  .object({
    error: RepoError,
  })
  .meta({
    ref: "RepoErrorResponse",
  })

const CloneInput = z.object({
  url: z.string(),
  branch: z.string().optional(),
  credentials: Repo.CloneCredentials.optional(),
  workspaceRoot: z.string().optional(),
})

const CloneResult = z
  .object({
    repo: Repo.Info,
    message: z.string(),
  })
  .meta({
    ref: "RepoCloneResult",
  })

const CloneProgressEvent = z
  .union([
    z.object({ type: z.literal("progress"), data: Repo.CloneProgress }),
    z.object({ type: z.literal("complete"), data: CloneResult }),
    z.object({ type: z.literal("error"), data: RepoError }),
  ])
  .meta({
    ref: "RepoCloneProgressEvent",
  })

const BranchList = z
  .object({
    current: z.string().optional(),
    branches: Repo.BranchInfo.array(),
  })
  .meta({
    ref: "RepoBranchList",
  })

const CheckoutResult = z
  .object({
    dirty: z.literal(false),
  })
  .meta({
    ref: "RepoCheckoutResult",
  })

const HTTPS_CLONE_UNSUPPORTED_CODE = "https_clone_unsupported"

function isSshCloneUrl(url: string) {
  const trimmed = url.trim().toLowerCase()
  return trimmed.startsWith("git@") || trimmed.startsWith("ssh://")
}

function unsupportedHttpsCloneError(): z.infer<typeof RepoError> {
  return {
    code: HTTPS_CLONE_UNSUPPORTED_CODE,
    message: "HTTPS cloning is not yet supported. Use an SSH clone URL and add SSH keys in Settings > Repositories.",
    help_steps: [
      "Use an SSH URL such as git@github.com:owner/repo.git.",
      "Add an SSH key in Settings > Repositories before cloning.",
    ],
    can_retry_with_credentials: false,
  }
}

function cloneErrorInfo(error: unknown): z.infer<typeof RepoError> {
  if (error instanceof Repo.CloneError) {
    return error.info
  }
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: "Clone failed." }
}

function cloneAuditDetails(
  input: z.infer<typeof CloneInput>,
  destination: Awaited<ReturnType<typeof Repo.getCloneDestination>>,
  auth: ReturnType<typeof getAuthContext>,
) {
  return {
    username: auth?.username,
    uid: auth?.uid,
    gid: auth?.gid,
    session_id: auth?.sessionId,
    url: Repo.safeCloneUrl(input.url),
    branch: input.branch,
    repo: destination.name,
    destination: destination.destination,
    workspace_root: destination.workspaceRoot,
    timestamp: new Date().toISOString(),
  }
}

function cloneBlockedAuditDetails(
  input: { url: string; branch?: string; workspaceRoot?: string },
  auth: ReturnType<typeof getAuthContext>,
  reason: string,
) {
  return {
    username: auth?.username,
    uid: auth?.uid,
    gid: auth?.gid,
    session_id: auth?.sessionId,
    url: Repo.safeCloneUrl(input.url),
    branch: input.branch,
    workspace_root: input.workspaceRoot,
    reason,
    timestamp: new Date().toISOString(),
  }
}

export const RepoRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List repos",
        description: "Get a list of tracked repositories.",
        operationId: "repo.list",
        responses: {
          200: {
            description: "List of repositories",
            content: {
              "application/json": {
                schema: resolver(Repo.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const repos = await Repo.list()
        return c.json(repos)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Add repo",
        description: "Add an existing local git repository by path.",
        operationId: "repo.add",
        responses: {
          200: {
            description: "Repository added",
            content: {
              "application/json": {
                schema: resolver(Repo.Info),
              },
            },
          },
          400: {
            description: "Invalid repository path",
            content: {
              "application/json": {
                schema: resolver(RepoErrorResponse),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          path: z.string(),
          name: z.string().optional(),
        }),
      ),
      async (c) => {
        try {
          const repo = await Repo.add(c.req.valid("json"))
          return c.json(repo)
        } catch (error) {
          return c.json({ error: cloneErrorInfo(error) }, 400)
        }
      },
    )
    .post(
      "/clone",
      describeRoute({
        summary: "Clone repo",
        description: "Clone a repository into the configured workspace root.",
        operationId: "repo.clone",
        responses: {
          200: {
            description: "Repository cloned",
            content: {
              "application/json": {
                schema: resolver(CloneResult),
              },
            },
          },
          400: {
            description: "Clone failed",
            content: {
              "application/json": {
                schema: resolver(RepoErrorResponse),
              },
            },
          },
        },
      }),
      validator("json", CloneInput),
      async (c) => {
        const input = c.req.valid("json")
        const auth = getAuthContext(c)
        log.info("clone.request", {
          url: Repo.safeCloneUrl(input.url),
          method: "POST",
          has_credentials: !!input.credentials,
          credential_type: input.credentials?.type,
          username: auth?.username,
        })
        if (!isSshCloneUrl(input.url)) {
          const info = unsupportedHttpsCloneError()
          Repo.audit("clone.blocked", cloneBlockedAuditDetails(input, auth, info.code ?? HTTPS_CLONE_UNSUPPORTED_CODE))
          return c.json({ error: info }, 400)
        }
        const destination = await Repo.getCloneDestination({
          url: input.url,
          workspaceRoot: input.workspaceRoot,
        })
        const audit = cloneAuditDetails(input, destination, auth)
        Repo.audit("clone.start", audit)
        const startTime = Date.now()
        try {
          const result = await Repo.clone(input)
          Repo.audit("clone.complete", { ...audit, repo_id: result.repo.id })
          log.info("clone.complete", {
            url: Repo.safeCloneUrl(input.url),
            repo_id: result.repo.id,
            duration: Date.now() - startTime,
          })
          return c.json(result)
        } catch (error) {
          const info = cloneErrorInfo(error)
          Repo.audit("clone.error", { ...audit, error: info.message })
          log.error("clone.failed", {
            url: Repo.safeCloneUrl(input.url),
            error: info.message,
            duration: Date.now() - startTime,
          })
          return c.json({ error: info }, 400)
        }
      },
    )
    .get(
      "/clone-progress",
      describeRoute({
        summary: "Clone repo (progress)",
        description: "Clone a repository and stream progress events.",
        operationId: "repo.cloneProgress",
        responses: {
          200: {
            description: "Clone progress stream",
            content: {
              "text/event-stream": {
                schema: resolver(Repo.CloneProgress),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          url: z.string(),
          branch: z.string().optional(),
        }),
      ),
      async (c) => {
        const input = c.req.valid("query")
        const auth = getAuthContext(c)
        log.info("clone.request", {
          url: Repo.safeCloneUrl(input.url),
          method: "GET",
          username: auth?.username,
        })
        if (!isSshCloneUrl(input.url)) {
          const info = unsupportedHttpsCloneError()
          Repo.audit("clone.blocked", cloneBlockedAuditDetails(input, auth, info.code ?? HTTPS_CLONE_UNSUPPORTED_CODE))
          return streamSSE(c, async (stream) => {
            await stream.writeSSE({
              event: "clone_error",
              data: JSON.stringify(info),
            })
            stream.close()
          })
        }
        const destination = await Repo.getCloneDestination({ url: input.url })
        const audit = cloneAuditDetails(input, destination, auth)
        Repo.audit("clone.start", audit)

        const startTime = Date.now()
        return streamSSE(c, async (stream) => {
          let closed = false
          stream.onAbort(() => {
            closed = true
          })
          const send = async (payload: unknown, event?: string) => {
            if (closed) return
            await stream.writeSSE({
              event,
              data: JSON.stringify(payload),
            })
          }
          try {
            const result = await Repo.cloneWithProgress({
              url: input.url,
              branch: input.branch,
              onProgress: (progress) => {
                void send(progress)
              },
            })
            Repo.audit("clone.complete", { ...audit, repo_id: result.repo.id })
            log.info("clone.complete", {
              url: Repo.safeCloneUrl(input.url),
              repo_id: result.repo.id,
              duration: Date.now() - startTime,
            })
            await send(result, "complete")
          } catch (error) {
            const info = cloneErrorInfo(error)
            Repo.audit("clone.error", { ...audit, error: info.message })
            log.error("clone.failed", {
              url: Repo.safeCloneUrl(input.url),
              error: info.message,
              duration: Date.now() - startTime,
            })
            await send(info, "clone_error")
          } finally {
            stream.close()
          }
        })
      },
    )
    .post(
      "/clone-progress",
      describeRoute({
        summary: "Clone repo (progress via POST)",
        description: "Clone a repository with credentials and stream progress events.",
        operationId: "repo.cloneProgressWithCredentials",
        responses: {
          200: {
            description: "Clone progress stream",
            content: {
              "text/event-stream": {
                schema: resolver(CloneProgressEvent),
              },
            },
          },
        },
      }),
      validator("json", CloneInput),
      async (c) => {
        const input = c.req.valid("json")
        const auth = getAuthContext(c)
        log.info("clone.request", {
          url: Repo.safeCloneUrl(input.url),
          method: "POST_SSE",
          has_credentials: !!input.credentials,
          credential_type: input.credentials?.type,
          username: auth?.username,
        })
        if (!isSshCloneUrl(input.url)) {
          const info = unsupportedHttpsCloneError()
          Repo.audit("clone.blocked", cloneBlockedAuditDetails(input, auth, info.code ?? HTTPS_CLONE_UNSUPPORTED_CODE))
          return streamSSE(c, async (stream) => {
            await stream.writeSSE({
              data: JSON.stringify({ type: "error", data: info }),
            })
            stream.close()
          })
        }
        const destination = await Repo.getCloneDestination({
          url: input.url,
          workspaceRoot: input.workspaceRoot,
        })
        const audit = cloneAuditDetails(input, destination, auth)
        Repo.audit("clone.start", audit)

        const startTime = Date.now()
        return streamSSE(c, async (stream) => {
          let closed = false
          stream.onAbort(() => {
            closed = true
          })
          const send = async (payload: unknown) => {
            if (closed) return
            await stream.writeSSE({
              data: JSON.stringify(payload),
            })
          }
          try {
            const result = await Repo.cloneWithProgress({
              url: input.url,
              branch: input.branch,
              credentials: input.credentials,
              onProgress: (progress) => {
                void send({ type: "progress", data: progress })
              },
            })
            Repo.audit("clone.complete", { ...audit, repo_id: result.repo.id })
            log.info("clone.complete", {
              url: Repo.safeCloneUrl(input.url),
              repo_id: result.repo.id,
              duration: Date.now() - startTime,
            })
            await send({ type: "complete", data: result })
          } catch (error) {
            const info = cloneErrorInfo(error)
            Repo.audit("clone.error", { ...audit, error: info.message })
            log.error("clone.failed", {
              url: Repo.safeCloneUrl(input.url),
              error: info.message,
              duration: Date.now() - startTime,
            })
            await send({ type: "error", data: info })
          } finally {
            stream.close()
          }
        })
      },
    )
    .get(
      "/:repoID/branches",
      describeRoute({
        summary: "List repo branches",
        description: "List branches for a tracked repository.",
        operationId: "repo.branches",
        responses: {
          200: {
            description: "Branch list",
            content: {
              "application/json": {
                schema: resolver(BranchList),
              },
            },
          },
          400: {
            description: "Invalid repository path",
            content: {
              "application/json": {
                schema: resolver(RepoErrorResponse),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ repoID: z.string() })),
      async (c) => {
        try {
          const repo = await Repo.get(c.req.valid("param").repoID)
          const branches = await Repo.listBranches(repo)
          return c.json(branches)
        } catch (error) {
          if (error instanceof Repo.InvalidRecordError) {
            return c.json({ error: error.info }, 400)
          }
          if (error instanceof Repo.CloneError) {
            return c.json({ error: cloneErrorInfo(error) }, 400)
          }
          throw error
        }
      },
    )
    .post(
      "/:repoID/checkout",
      describeRoute({
        summary: "Checkout repo branch",
        description: "Switch branches for a tracked repository.",
        operationId: "repo.checkout",
        responses: {
          200: {
            description: "Branch switched",
            content: {
              "application/json": {
                schema: resolver(CheckoutResult),
              },
            },
          },
          409: {
            description: "Working tree dirty",
            content: {
              "application/json": {
                schema: resolver(RepoErrorResponse),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ repoID: z.string() })),
      validator(
        "json",
        z.object({
          branch: z.string(),
          force: z.boolean().optional(),
        }),
      ),
      async (c) => {
        const { repoID } = c.req.valid("param")
        const { branch, force } = c.req.valid("json")
        const repo = await Repo.get(repoID)
        const result = await Repo.checkoutBranch(repo, branch, force)
        if (result.dirty) {
          return c.json(
            {
              error: {
                code: "repo_dirty",
                message: "Working tree has uncommitted changes.",
                files: result.files,
              },
            },
            409,
          )
        }
        return c.json({ dirty: false })
      },
    ),
)
