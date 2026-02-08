import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Icon } from "@opencode-ai/ui/icon"
import { ProgressCircle } from "@opencode-ai/ui/progress-circle"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import type { OpencodeClient, Repo, RepoCloneProgress } from "@opencode-ai/sdk/v2/client"
import { useCloneProgress, type CloneAuthType, type CloneProgressPlatform, type CloneProgressServer } from "../use-clone-progress"
import { isHttpCloneUrl, isSshCloneUrl } from "./clone-url-policy"

interface CloneDialogProps {
  client: Pick<OpencodeClient, "config" | "sshKeys">
  server: CloneProgressServer
  platform: CloneProgressPlatform
  homePath?: string
  onCloneSuccess?: (repo: Repo) => void
  onOpenRepositoriesSettings?: () => void
}

type CredentialMode = "ssh" | null

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CloneDialog(props: CloneDialogProps) {
  const dialog = useDialog()

  const [gitUrl, setGitUrl] = createSignal("")
  const [branch, setBranch] = createSignal("")
  const [cloneProgress, setCloneProgress] = createSignal<RepoCloneProgress | null>(null)
  const [isCloning, setIsCloning] = createSignal(false)
  const [maybeErrorInfo, setMaybeErrorInfo] = createSignal<{
    message: string
    helpSteps?: string[]
    authType?: CloneAuthType
    canRetry?: boolean
  } | null>(null)

  const [credentialMode, setCredentialMode] = createSignal<CredentialMode>(null)
  const [sshPassphrase, setSshPassphrase] = createSignal("")

  const trimmedUrl = createMemo(() => gitUrl().trim())
  const isSshUrl = createMemo(() => isSshCloneUrl(trimmedUrl()))
  const isHttpUrl = createMemo(() => isHttpCloneUrl(trimmedUrl()))

  const [sshKeys, { refetch: refetchSshKeys }] = createResource(
    () => (isSshUrl() ? "ssh" : null),
    async () => {
      try {
        return (await props.client.sshKeys.list()).data ?? []
      } catch {
        return undefined
      }
    },
  )

  const missingSshKeys = createMemo(() => {
    if (!isSshUrl()) return false
    const keys = sshKeys()
    if (!keys) return false
    return keys.length === 0
  })

  const [config] = createResource(async () => {
    try {
      return (await props.client.config.get()).data
    } catch {
      return undefined
    }
  })

  const workspaceRoot = createMemo(() => {
    const root = config()?.workspace?.root
    if (!root) return undefined
    const home = props.homePath
    if (home && root.startsWith(home)) {
      return `~${root.slice(home.length)}`
    }
    return root
  })

  const { startClone, startCloneWithCredentials, cancel } = useCloneProgress(
    {
      onProgress: setCloneProgress,
      onComplete: (repo: Repo, message: string) => {
        setIsCloning(false)
        setCloneProgress(null)
        setCredentialMode(null)
        setSshPassphrase("")
        props.onCloneSuccess?.(repo)
        showToast({ title: "Repository cloned", description: message })
        dialog.close()
      },
      onError: (message: string, helpSteps?: string[], authType?: CloneAuthType, canRetry?: boolean) => {
        setIsCloning(false)
        setCloneProgress(null)
        setMaybeErrorInfo({ message, helpSteps, authType, canRetry })
        if (authType === "ssh") {
          void refetchSshKeys()
        }
        if (canRetry && authType === "ssh") {
          setCredentialMode("ssh")
        } else {
          setCredentialMode(null)
        }
        showToast({ title: "Failed to clone repository", description: message })
      },
    },
    {
      server: props.server,
      platform: props.platform,
    },
  )

  const progressPercentage = createMemo(() => {
    const progress = cloneProgress()
    if (!progress || progress.total_objects === 0) return 0
    return Math.round((progress.received_objects / progress.total_objects) * 100)
  })

  const progressText = createMemo(() => {
    const progress = cloneProgress()
    if (!progress) return ""
    if (
      progress.received_objects === progress.total_objects &&
      progress.total_deltas > 0 &&
      progress.indexed_deltas < progress.total_deltas
    ) {
      return `Indexing: ${progress.indexed_deltas} / ${progress.total_deltas} deltas`
    }
    return `Downloading: ${progress.received_objects} / ${progress.total_objects} objects (${formatBytes(
      progress.received_bytes,
    )})`
  })

  const resetForm = () => {
    setGitUrl("")
    setBranch("")
    setMaybeErrorInfo(null)
    setCredentialMode(null)
    setSshPassphrase("")
  }

  const handleClose = () => {
    if (isCloning()) cancel()
    dialog.close()
  }

  const handleClone = () => {
    if (!trimmedUrl()) {
      showToast({ title: "URL required", description: "Enter an SSH git URL to clone." })
      return
    }
    if (isHttpUrl()) {
      showToast({
        title: "HTTPS cloning is unsupported",
        description: "Use an SSH URL and add your SSH key in Settings > Repositories.",
      })
      return
    }
    setMaybeErrorInfo(null)
    setIsCloning(true)
    startClone(trimmedUrl(), branch().trim() || undefined)
  }

  const handleRetryWithCredentials = async () => {
    if (credentialMode() !== "ssh") return

    setMaybeErrorInfo(null)
    setIsCloning(true)

    await startCloneWithCredentials(
      trimmedUrl(),
      {
        type: "ssh_passphrase",
        passphrase: sshPassphrase(),
      },
      branch().trim() || undefined,
    )
  }

  const hasValidCredentials = createMemo(() => {
    return credentialMode() === "ssh" && sshPassphrase().trim().length > 0
  })

  return (
    <Dialog
      title="Clone from URL"
      description="Enter an SSH git URL to clone the repository. HTTPS clone URLs are currently unsupported."
      class="max-w-[520px]"
    >
      <div class="flex flex-col gap-4 px-2 pb-3" data-action="repo-clone-dialog">
        <TextField
          autofocus
          label="Repository URL"
          placeholder="git@github.com:user/repo.git"
          value={gitUrl()}
          onChange={setGitUrl}
          disabled={isCloning()}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Enter" && !isCloning()) handleClone()
          }}
        />
        <TextField
          label="Branch (optional)"
          placeholder="main"
          value={branch()}
          onChange={setBranch}
          disabled={isCloning()}
        />

        <Show when={isHttpUrl()}>
          <div
            class="rounded-md border border-border-weak-base bg-surface-warning-base/30 p-3"
            data-action="repo-clone-https-warning"
          >
            <div class="text-12-medium text-text-strong">HTTPS cloning is not supported in this fork.</div>
            <div class="mt-1 text-12-regular text-text-weak">
              Use an SSH URL and an SSH key. Password, PAT, and token-based HTTPS auth are intentionally unsupported
              right now.
            </div>
          </div>
        </Show>

        <Show when={workspaceRoot()}>
          {(root) => <div class="text-12-regular text-text-weak">Repository will be cloned to {root()}</div>}
        </Show>

        <Show when={isCloning()}>
          <div class="flex items-center gap-3 rounded-md border border-border-weak-base p-3">
            <ProgressCircle size={18} strokeWidth={2} percentage={progressPercentage()} />
            <div class="flex flex-col gap-0.5">
              <div class="text-12-medium text-text-strong">{progressPercentage()}%</div>
              <div class="text-12-regular text-text-weak">{progressText()}</div>
            </div>
          </div>
        </Show>

        <Show when={maybeErrorInfo()}>
          {(errorInfo) => (
            <div class="rounded-md border border-border-weak-base bg-surface-warning-base/30 p-3">
              <div class="text-12-medium text-text-strong">{errorInfo().message}</div>
              <Show when={errorInfo().helpSteps?.length}>
                <ul class="mt-2 list-disc pl-5 text-12-regular text-text-weak">
                  <For each={errorInfo().helpSteps}>{(step) => <li>{step}</li>}</For>
                </ul>
              </Show>
            </div>
          )}
        </Show>

        <Show when={missingSshKeys()}>
          <div class="rounded-md border border-border-weak-base bg-surface-warning-base/30 p-3">
            <div class="text-12-medium text-text-strong">SSH key required</div>
            <div class="mt-1 text-12-regular text-text-weak">Add an SSH key to clone repositories over SSH.</div>
            <div class="mt-3 flex justify-end">
              <Button
                size="normal"
                onClick={() => props.onOpenRepositoriesSettings?.()}
                disabled={isCloning()}
                data-action="repo-clone-add-ssh-key"
              >
                Add SSH key
              </Button>
            </div>
          </div>
        </Show>

        <Show when={credentialMode() === "ssh"}>
          <div class="rounded-md border border-border-weak-base bg-surface-raised-base p-3 flex flex-col gap-3">
            <div class="text-12-medium text-text-strong">Authentication required</div>
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <div class="text-12-medium text-text-weak">SSH key passphrase</div>
                <Tooltip value="Used only for this clone, not stored.">
                  <Icon name="help" size="small" class="text-text-weak" />
                </Tooltip>
              </div>
              <TextField
                label="Passphrase"
                hideLabel
                type="password"
                placeholder="Enter passphrase for your SSH key"
                value={sshPassphrase()}
                onChange={setSshPassphrase}
                disabled={isCloning()}
              />
              <div class="text-12-regular text-text-weak">Used only for this clone. Not stored.</div>
            </div>

            <Collapsible>
              <Collapsible.Trigger class="text-12-regular text-text-weak flex items-center gap-2">
                <Icon name="chevron-down" size="small" />
                How is my passphrase used?
              </Collapsible.Trigger>
              <Collapsible.Content class="mt-2 text-12-regular text-text-weak">
                <ul class="list-disc pl-5">
                  <li>Sent only to SSH auth for this clone operation</li>
                  <li>Never stored on disk or in any database</li>
                  <li>Discarded immediately after clone completes or fails</li>
                </ul>
              </Collapsible.Content>
            </Collapsible>

            <Button
              size="large"
              class="w-full"
              onClick={handleRetryWithCredentials}
              disabled={isCloning() || !hasValidCredentials()}
            >
              {isCloning() ? "Cloning..." : "Retry with passphrase"}
            </Button>
          </div>
        </Show>

        <div class="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="large"
            onClick={() => {
              cancel()
              resetForm()
              handleClose()
            }}
            disabled={isCloning()}
          >
            Cancel
          </Button>
          <Button
            size="large"
            onClick={handleClone}
            disabled={isCloning() || isHttpUrl()}
            data-action="repo-clone-submit"
          >
            {isCloning() ? "Cloning..." : "Clone"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
