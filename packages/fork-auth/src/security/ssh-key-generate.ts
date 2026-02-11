import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import z from "zod"
import { SshKey } from "../../../opencode/src/ssh/keys"
import { Log } from "../../../opencode/src/util/log"

export namespace SshKeyGenerate {
  const log = Log.create({ service: "ssh-key-generate" })

  export const Input = z
    .object({
      hosts: z.array(z.string().trim().min(1)).min(1),
      name: z.string().trim().min(1).optional(),
      passphrase: z.string().optional(),
    })
    .meta({
      ref: "SshKeyGenerateInput",
    })

  function normalizeHosts(hosts: string[]) {
    const normalized = hosts.map((host) => host.trim()).filter(Boolean)
    return Array.from(new Set(normalized))
  }

  function defaultName(hosts: string[]) {
    const first = hosts[0]
    if (!first) return "Generated SSH key"
    return `Generated key (${first})`
  }

  async function runSshKeygen(input: { privateKeyPath: string; passphrase: string; comment: string }) {
    return new Promise<void>((resolve, reject) => {
      const args = [
        "-q",
        "-t",
        "ed25519",
        "-a",
        "64",
        "-N",
        input.passphrase,
        "-f",
        input.privateKeyPath,
        "-C",
        input.comment,
      ]

      const proc = spawn("ssh-keygen", args, {
        stdio: ["ignore", "pipe", "pipe"],
      })

      let stderr = ""

      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString()
      })

      proc.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new Error(
              "ssh-keygen is not available on this host. Install OpenSSH or add an existing SSH key in Settings > Repositories.",
            ),
          )
          return
        }
        reject(error)
      })

      proc.on("close", (code) => {
        if (code === 0) {
          resolve()
          return
        }
        const message = stderr.trim()
        reject(new Error(message ? `ssh-keygen failed: ${message}` : "ssh-keygen failed."))
      })
    })
  }

  export async function generate(input: z.infer<typeof Input>, options: { username: string; home?: string }) {
    const parsed = Input.parse({
      ...input,
      hosts: normalizeHosts(input.hosts),
    })

    if (parsed.hosts.length === 0) {
      throw new Error("At least one host pattern is required.")
    }

    const passphrase = parsed.passphrase ?? ""
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-ssh-keygen-"))
    const privateKeyPath = path.join(tempDir, "id_ed25519")
    const publicKeyPath = `${privateKeyPath}.pub`
    const keyName = parsed.name?.trim() || defaultName(parsed.hosts)

    log.info("generate.start", {
      username: options.username,
      hosts: parsed.hosts,
      name: keyName,
      has_passphrase: passphrase.length > 0,
    })

    try {
      await runSshKeygen({
        privateKeyPath,
        passphrase,
        comment: "opencode-generated",
      })

      const [privateKey, publicKey] = await Promise.all([
        fs.readFile(privateKeyPath, "utf8"),
        fs.readFile(publicKeyPath, "utf8"),
      ])

      const created = await SshKey.create(
        {
          name: keyName,
          hosts: parsed.hosts,
          privateKey,
          publicKey,
        },
        options,
      )

      log.info("generate.complete", {
        username: options.username,
        hosts: parsed.hosts,
        key_id: created.id,
      })

      return created
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
