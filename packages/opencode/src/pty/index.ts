import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { type IPty } from "bun-pty"
import z from "zod"
import { Identifier } from "../id/id"
import { Log } from "../util/log"
import type { WSContext } from "hono/ws"
import { Instance } from "../project/instance"
import { lazy } from "@opencode-ai/util/lazy"
import { ServerAuth } from "@/config/server-auth"
import { createBrokerPtyManager } from "@opencode-ai/fork-terminal/broker-pty-manager"
import { createTerminal } from "@opencode-ai/fork-terminal/server"
import { createPtyViaBroker } from "@opencode-ai/fork-terminal/server-pty"
import { Shell } from "@/shell/shell"
import { Plugin } from "@/plugin"

// Re-export broker PTY module for authenticated sessions
export * as BrokerPty from "./broker-pty"

export namespace Pty {
  const log = Log.create({ service: "pty" })

  const BUFFER_LIMIT = 1024 * 1024 * 2
  const BUFFER_CHUNK = 64 * 1024
  const TERMINAL_EXIT_MESSAGE = "\r\n[opencode] Terminal session ended.\r\n"
  const encoder = new TextEncoder()

  // WebSocket control frame: 0x00 + UTF-8 JSON (currently { cursor }).
  const meta = (cursor: number) => {
    const json = JSON.stringify({ cursor })
    const bytes = encoder.encode(json)
    const out = new Uint8Array(bytes.length + 1)
    out[0] = 0
    out.set(bytes, 1)
    return out
  }

  const pty = lazy(async () => {
    const { spawn } = await import("bun-pty")
    return spawn
  })

  export const Info = z
    .object({
      id: Identifier.schema("pty"),
      title: z.string(),
      command: z.string(),
      args: z.array(z.string()),
      cwd: z.string(),
      status: z.enum(["running", "exited"]),
      pid: z.number(),
    })
    .meta({ ref: "Pty" })

  export type Info = z.infer<typeof Info>

  export const CreateInput = z.object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    title: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
  })

  export type CreateInput = z.infer<typeof CreateInput>

  export const UpdateInput = z.object({
    title: z.string().optional(),
    size: z
      .object({
        rows: z.number(),
        cols: z.number(),
      })
      .optional(),
  })

  export type UpdateInput = z.infer<typeof UpdateInput>

  export const Event = {
    Created: BusEvent.define("pty.created", z.object({ info: Info })),
    Updated: BusEvent.define("pty.updated", z.object({ info: Info })),
    Exited: BusEvent.define("pty.exited", z.object({ id: Identifier.schema("pty"), exitCode: z.number() })),
    Deleted: BusEvent.define("pty.deleted", z.object({ id: Identifier.schema("pty") })),
  }

  interface ActiveSession {
    info: Info
    process: IPty
    buffer: string
    bufferCursor: number
    cursor: number
    subscribers: Set<WSContext>
  }

  const state = Instance.state(
    () => new Map<string, ActiveSession>(),
    async (sessions) => {
      for (const session of sessions.values()) {
        try {
          session.process.kill()
        } catch {}
        for (const ws of session.subscribers) {
          ws.close()
        }
      }
      sessions.clear()
    },
  )

  const brokerState = Instance.state(
    () =>
      createBrokerPtyManager<Info>({
        onExit: (info) => {
          info.status = "exited"
          void Bus.publish(Event.Exited, { id: info.id, exitCode: 0 })
        },
      }),
    async (manager) => {
      await manager.cleanup()
    },
  )

  export function list() {
    return [...Array.from(state().values()).map((s) => s.info), ...brokerState().list()]
  }

  export function get(id: string) {
    return state().get(id)?.info ?? brokerState().get(id)
  }

  /**
   * Create a PTY session.
   *
   * When auth is enabled and a session ID is provided, routes creation
   * through the broker for user impersonation. Otherwise uses local bun-pty.
   */
  export async function create(input: CreateInput, maybeSessionId?: string, requestId?: string): Promise<Info> {
    return createTerminal(
      input,
      {
        sessionId: maybeSessionId,
        requestId,
      },
      {
        isAuthEnabled: () => ServerAuth.get().enabled,
        createLocal,
        createViaBroker: createViaBrokerImpl,
      },
    )
  }

  /**
   * Create a PTY session via the auth broker.
   */
  async function createViaBrokerImpl(input: CreateInput, sessionId: string, requestId?: string): Promise<Info> {
    const info = await createPtyViaBroker(input, sessionId, requestId, {
      brokerManager: brokerState(),
      shellPreferred: Shell.preferred,
      instanceDirectory: Instance.directory,
      log,
    })
    Bus.publish(Event.Created, { info })
    return info
  }

  /**
   * Create a PTY session locally using bun-pty.
   */
  async function createLocal(input: CreateInput, requestId?: string): Promise<Info> {
    const id = Identifier.create("pty", false)
    const command = input.command || Shell.preferred()
    const args = input.args || []
    if (command.endsWith("sh")) {
      args.push("-l")
    }

    const cwd = input.cwd || Instance.directory
    const shellEnv = await Plugin.trigger("shell.env", { cwd }, { env: {} })
    const env = {
      ...process.env,
      ...input.env,
      ...shellEnv.env,
      TERM: "xterm-256color",
      OPENCODE_TERMINAL: "1",
    } as Record<string, string>

    if (process.platform === "win32") {
      env.LC_ALL = "C.UTF-8"
      env.LC_CTYPE = "C.UTF-8"
      env.LANG = "C.UTF-8"
    }
    log.info("creating session", { id, cmd: command, args, cwd, requestId })

    const spawn = await pty()
    const ptyProcess = spawn(command, args, {
      name: "xterm-256color",
      cwd,
      env,
    })

    const info = {
      id,
      title: input.title || `Terminal ${id.slice(-4)}`,
      command,
      args,
      cwd,
      status: "running",
      pid: ptyProcess.pid,
    } as const
    const session: ActiveSession = {
      info,
      process: ptyProcess,
      buffer: "",
      bufferCursor: 0,
      cursor: 0,
      subscribers: new Set(),
    }
    state().set(id, session)
    ptyProcess.onData((data) => {
      session.cursor += data.length

      for (const ws of session.subscribers) {
        if (ws.readyState !== 1) {
          session.subscribers.delete(ws)
          continue
        }
        ws.send(data)
      }

      session.buffer += data
      if (session.buffer.length <= BUFFER_LIMIT) return
      const excess = session.buffer.length - BUFFER_LIMIT
      session.buffer = session.buffer.slice(excess)
      session.bufferCursor += excess
    })
    ptyProcess.onExit(({ exitCode }) => {
      log.info("session exited", { id, exitCode })
      session.info.status = "exited"
      for (const ws of session.subscribers) {
        if (ws.readyState === 1) {
          try {
            ws.send(TERMINAL_EXIT_MESSAGE)
          } catch {}
        }
        ws.close()
      }
      session.subscribers.clear()
      Bus.publish(Event.Exited, { id, exitCode })
      state().delete(id)
    })
    Bus.publish(Event.Created, { info })
    return info
  }

  export async function update(id: string, input: UpdateInput) {
    const session = state().get(id)
    if (session) {
      if (input.title) {
        session.info.title = input.title
      }
      if (input.size) {
        session.process.resize(input.size.cols, input.size.rows)
      }
      Bus.publish(Event.Updated, { info: session.info })
      return session.info
    }

    const brokerInfo = brokerState().get(id)
    if (!brokerInfo) return
    if (input.title) {
      brokerInfo.title = input.title
    }
    if (input.size) {
      await brokerState().resize(id, input.size.cols, input.size.rows)
    }
    Bus.publish(Event.Updated, { info: brokerInfo })
    return brokerInfo
  }

  export async function remove(id: string) {
    const session = state().get(id)
    if (session) {
      log.info("removing session", { id })
      try {
        session.process.kill()
      } catch {}
      for (const ws of session.subscribers) {
        ws.close()
      }
      state().delete(id)
      Bus.publish(Event.Deleted, { id })
      return
    }

    const brokerInfo = brokerState().get(id)
    if (!brokerInfo) return
    await brokerState().kill(id)
    Bus.publish(Event.Deleted, { id })
  }

  export function resize(id: string, cols: number, rows: number) {
    const session = state().get(id)
    if (session && session.info.status === "running") {
      session.process.resize(cols, rows)
      return
    }

    if (brokerState().has(id)) {
      void brokerState().resize(id, cols, rows)
    }
  }

  export function write(id: string, data: string) {
    const session = state().get(id)
    if (session && session.info.status === "running") {
      session.process.write(data)
      return
    }

    if (brokerState().has(id)) {
      void brokerState().write(id, data)
    }
  }

  export function connect(id: string, ws: WSContext, options: { requestId?: string; cursor?: number } = {}) {
    const session = state().get(id)
    if (!session) {
      if (brokerState().has(id)) {
        return brokerState().connect(id, ws, { requestId: options.requestId })
      }
      ws.close()
      return
    }
    log.info("client connected to session", { id, requestId: options.requestId })

    const start = session.bufferCursor
    const end = session.cursor
    const cursor = options.cursor

    const from =
      cursor === -1 ? end : typeof cursor === "number" && Number.isSafeInteger(cursor) ? Math.max(0, cursor) : 0

    const data = (() => {
      if (!session.buffer) return ""
      if (from >= end) return ""
      const offset = Math.max(0, from - start)
      if (offset >= session.buffer.length) return ""
      return session.buffer.slice(offset)
    })()

    if (data) {
      try {
        for (let i = 0; i < data.length; i += BUFFER_CHUNK) {
          ws.send(data.slice(i, i + BUFFER_CHUNK))
        }
      } catch {
        ws.close()
        return
      }
    }

    try {
      ws.send(meta(end))
    } catch {
      ws.close()
      return
    }

    session.subscribers.add(ws)
    return {
      onMessage: (message: string | ArrayBuffer) => {
        session.process.write(String(message))
      },
      onClose: () => {
        log.info("client disconnected from session", { id, requestId: options.requestId })
        session.subscribers.delete(ws)
      },
    }
  }
}
