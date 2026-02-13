import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
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
import { errorMessage } from "../error-message"
import {
  useCloneProgress,
  type CloneAuthType,
  type CloneProgressPlatform,
  type CloneProgressServer,
} from "../use-clone-progress"
import { isHttpCloneUrl, isSshCloneUrl, parseSshCloneHost } from "./clone-url-policy"

interface CloneDialogProps {
  client: Pick<OpencodeClient, "config" | "sshKeys">
  server: CloneProgressServer
  platform: CloneProgressPlatform
  homePath?: string
  onCloneSuccess?: (repo: Repo) => void
  onOpenRepositoriesSettings?: () => void
}

type CredentialMode = "ssh" | null

const HOST_KEY_URLS: Record<string, { label: string; url: string }> = {
  "github.com": {
    label: "GitHub SSH settings",
    url: "https://github.com/settings/keys",
  },
  "gitlab.com": {
    label: "GitLab SSH settings",
    url: "https://gitlab.com/-/user_settings/ssh_keys",
  },
  "bitbucket.org": {
    label: "Bitbucket SSH settings",
    url: "https://bitbucket.org/account/settings/ssh-keys/",
  },
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase()
}

function getProviderKeySettings(host: string) {
  return HOST_KEY_URLS[normalizeHost(host)]
}

export function CloneDialog(props: CloneDialogProps) {
  const dialog = useDialog()

  const [gitUrl, setGitUrl] = createSignal("")
  const [branch, setBranch] = createSignal("")
  const [cloneProgress, setCloneProgress] = createSignal<RepoCloneProgress | null>(null)
  const [isCloning, setIsCloning] = createSignal(false)
  const [isGenerating, setIsGenerating] = createSignal(false)
  const [maybeErrorInfo, setMaybeErrorInfo] = createSignal<{
    message: string
    helpSteps?: string[]
    authType?: CloneAuthType
    canRetry?: boolean
  } | null>(null)

  const [credentialMode, setCredentialMode] = createSignal<CredentialMode>(null)
  const [sshPassphrase, setSshPassphrase] = createSignal("")
  const [usePassphraseOnFirstClone, setUsePassphraseOnFirstClone] = createSignal(false)

  const [generateHost, setGenerateHost] = createSignal("github.com")
  const [generateName, setGenerateName] = createSignal("")
  const [generatePassphrase, setGeneratePassphrase] = createSignal("")
  const [hostEdited, setHostEdited] = createSignal(false)

  const [generatedPublicKey, setGeneratedPublicKey] = createSignal<string | null>(null)
  const [generatedHost, setGeneratedHost] = createSignal("")
  const [copyLabel, setCopyLabel] = createSignal("Copy")

  const trimmedUrl = createMemo(() => gitUrl().trim())
  const isSshUrl = createMemo(() => isSshCloneUrl(trimmedUrl()))
  const isHttpUrl = createMemo(() => isHttpCloneUrl(trimmedUrl()))
  const suggestedHost = createMemo(() => parseSshCloneHost(trimmedUrl()) ?? "github.com")
  const normalizedGenerateHost = createMemo(() => normalizeHost(generateHost()))

  createEffect(() => {
    if (hostEdited()) return
    setGenerateHost(suggestedHost())
  })

  const [sshKeys, { refetch: refetchSshKeys }] = createResource(async () => {
    try {
      return (await props.client.sshKeys.list()).data ?? []
    } catch {
      return undefined
    }
  })

  const missingSshKeys = createMemo(() => {
    const keys = sshKeys()
    if (!Array.isArray(keys)) return false
    return keys.length === 0
  })

  const providerSettings = createMemo(() => getProviderKeySettings(generatedHost() || normalizedGenerateHost()))

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
        setUsePassphraseOnFirstClone(false)
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

  const canGenerateKey = createMemo(() => normalizedGenerateHost().length > 0 && !isGenerating())

  const resetForm = () => {
    setGitUrl("")
    setBranch("")
    setMaybeErrorInfo(null)
    setCredentialMode(null)
    setSshPassphrase("")
    setUsePassphraseOnFirstClone(false)
    setGeneratePassphrase("")
    setGeneratedPublicKey(null)
    setGeneratedHost("")
    setCopyLabel("Copy")
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
        title: "HTTPS cloning is not yet supported",
        description: "Use an SSH URL and add your SSH key in Settings > Repositories.",
      })
      return
    }
    if (missingSshKeys()) {
      showToast({
        title: "SSH key required",
        description: "Generate or add an SSH key before cloning. Only SSH-based cloning is supported right now.",
      })
      return
    }

    setMaybeErrorInfo(null)
    setIsCloning(true)

    if (usePassphraseOnFirstClone() && sshPassphrase().trim()) {
      void startCloneWithCredentials(
        trimmedUrl(),
        {
          type: "ssh_passphrase",
          passphrase: sshPassphrase(),
        },
        branch().trim() || undefined,
      )
      return
    }

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

  const handleGenerateKey = async () => {
    const host = normalizedGenerateHost()
    if (!host) {
      showToast({ title: "Host required", description: "Enter a host like github.com before generating a key." })
      return
    }

    setIsGenerating(true)
    try {
      const result = await props.client.sshKeys.generate({
        sshKeyGenerateInput: {
          hosts: [host],
          name: generateName().trim() || undefined,
          passphrase: generatePassphrase() || undefined,
        },
      })

      const key = result.data
      if (!key) {
        throw new Error("SSH key generation did not return a key.")
      }

      await refetchSshKeys()
      setGeneratedPublicKey(key.publicKey)
      setGeneratedHost(host)
      setCopyLabel("Copy")

      const passphrase = generatePassphrase().trim()
      if (passphrase) {
        setSshPassphrase(passphrase)
        setUsePassphraseOnFirstClone(true)
      } else {
        setUsePassphraseOnFirstClone(false)
      }
      setGeneratePassphrase("")

      showToast({
        title: "SSH key generated",
        description: "Public key is ready. Add it to your git host, then clone over SSH.",
      })
    } catch (err) {
      showToast({ title: "Failed to generate SSH key", description: errorMessage(err, "Request failed") })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyGeneratedPublicKey = async () => {
    const key = generatedPublicKey()
    if (!key) return
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard
    if (!clipboard?.writeText) {
      showToast({ title: "Clipboard unavailable", description: "Copy this key manually." })
      return
    }

    try {
      await clipboard.writeText(key)
      setCopyLabel("Copied!")
      window.setTimeout(() => setCopyLabel("Copy"), 2000)
    } catch {
      showToast({ title: "Copy failed", description: "Copy this key manually." })
    }
  }

  const hasValidCredentials = createMemo(() => {
    return credentialMode() === "ssh" && sshPassphrase().trim().length > 0
  })

  return (
    <Dialog
      title="Clone from URL"
      description="Enter an SSH git URL to clone the repository. HTTPS clone URLs are not yet supported."
      class="max-w-[560px]"
    >
      <div class="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-2 pb-3" data-action="repo-clone-dialog">
        <TextField
          autofocus
          label="Repository URL"
          placeholder="git@github.com:user/repo.git"
          value={gitUrl()}
          onChange={setGitUrl}
          disabled={isCloning() || isGenerating()}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Enter" && !isCloning()) handleClone()
          }}
        />
        <TextField
          label="Branch (optional)"
          placeholder="main"
          value={branch()}
          onChange={setBranch}
          disabled={isCloning() || isGenerating()}
        />

        <Show when={isHttpUrl()}>
          <div
            class="rounded-md border border-border-weak-base bg-surface-warning-base/30 p-3"
            data-action="repo-clone-https-warning"
          >
            <div class="text-12-medium text-text-strong">
              HTTPS cloning is not yet supported in this fork of OpenCode. Stay updated by Watching our repo at{" "}
              <a
                href="https://github.com/pRizz/opencode-cloud"
                target="_blank"
                rel="noopener noreferrer"
                class="underline"
              >
                github.com/pRizz/opencode-cloud
              </a>{" "}
              or give feedback at{" "}
              <a
                href="https://github.com/pRizz/opencode-cloud/issues"
                target="_blank"
                rel="noopener noreferrer"
                class="underline"
              >
                github.com/pRizz/opencode-cloud/issues
              </a>
            </div>
            <div class="mt-1 text-12-regular text-text-weak">
              Use an SSH URL and an SSH key. Password, PAT, and token-based HTTPS auth are not yet supported.
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
          <div
            class="rounded-md border border-border-weak-base bg-surface-warning-base/30 p-3"
            data-action="repo-clone-no-ssh-keys"
          >
            <div class="text-12-medium text-text-strong">SSH key required</div>
            <div class="mt-1 text-12-regular text-text-weak">
              No SSH keys are configured for this account yet. Only SSH-based cloning is supported right now.
            </div>

            <div class="mt-3 flex flex-col gap-3 rounded-md border border-border-weak-base bg-surface-raised-base p-3">
              <div class="text-12-medium text-text-strong">Generate SSH key</div>
              <TextField
                label="Host"
                placeholder="github.com"
                value={generateHost()}
                onChange={(value) => {
                  setGenerateHost(value)
                  setHostEdited(true)
                }}
                disabled={isGenerating() || isCloning()}
              />
              <TextField
                label="Key name (optional)"
                placeholder="Generated key (github.com)"
                value={generateName()}
                onChange={setGenerateName}
                disabled={isGenerating() || isCloning()}
              />
              <TextField
                label="Passphrase (optional)"
                type="password"
                placeholder="Protect generated private key"
                value={generatePassphrase()}
                onChange={setGeneratePassphrase}
                disabled={isGenerating() || isCloning()}
              />
              <div class="text-12-regular text-text-weak">
                Uses OpenSSH <code class="text-12-regular">ssh-keygen</code> with{" "}
                <code class="text-12-regular">Ed25519</code> and 64 KDF rounds.
              </div>
              <div class="flex justify-end gap-2">
                <Button
                  size="normal"
                  variant="ghost"
                  onClick={() => props.onOpenRepositoriesSettings?.()}
                  disabled={isGenerating() || isCloning()}
                  data-action="repo-clone-add-ssh-key"
                >
                  Add manually
                </Button>
                <Button
                  size="normal"
                  onClick={handleGenerateKey}
                  disabled={!canGenerateKey() || isCloning()}
                  data-action="repo-clone-generate-key"
                >
                  {isGenerating() ? "Generating..." : "Generate SSH key"}
                </Button>
              </div>
            </div>

            <Collapsible>
              <Collapsible.Trigger
                class="mt-3 text-12-regular text-text-weak flex items-center gap-2"
                data-action="repo-clone-security-toggle"
              >
                <Icon name="chevron-down" size="small" />
                How key generation works (security)
              </Collapsible.Trigger>
              <Collapsible.Content
                class="mt-2 text-12-regular text-text-weak"
                data-action="repo-clone-security-content"
              >
                <ul class="list-disc pl-5">
                  <li>Generation runs on the machine hosting your opencode or opencode-cloud runtime.</li>
                  <li>
                    OpenSSH <code class="text-12-regular">ssh-keygen</code> creates an Ed25519 keypair, a modern and
                    secure default.
                  </li>
                  <li>Private keys are installed with restricted file permissions and scoped to configured hosts.</li>
                  <li>
                    A passphrase is optional; use one for stronger at-rest protection on long-lived or shared instances.
                  </li>
                  <li>Only the public key is shown in this UI for copy/add-to-provider workflows.</li>
                </ul>
              </Collapsible.Content>
            </Collapsible>
          </div>
        </Show>

        <Show when={generatedPublicKey()}>
          {(publicKey) => (
            <div
              class="rounded-md border border-border-weak-base bg-surface-raised-base p-3"
              data-action="repo-clone-generated-public-key"
            >
              <div class="text-12-medium text-text-strong">Generated public key</div>
              <div class="mt-1 text-12-regular text-text-weak">
                Add this key to your git provider account before cloning.
              </div>
              <pre class="mt-2 whitespace-pre-wrap break-all rounded-md border border-border-weak-base bg-background-base p-2 text-11-regular text-text-weak">
                {publicKey()}
              </pre>
              <div class="mt-2 flex items-center justify-between gap-3">
                <Show
                  when={providerSettings()}
                  fallback={
                    <div class="text-12-regular text-text-weak">
                      Add this public key in your git host&apos;s SSH key settings page.
                    </div>
                  }
                >
                  {(provider) => (
                    <a class="text-12-medium underline" href={provider().url} target="_blank" rel="noopener noreferrer">
                      Open {provider().label}
                    </a>
                  )}
                </Show>
                <Button
                  size="normal"
                  variant="ghost"
                  onClick={() => void handleCopyGeneratedPublicKey()}
                  data-action="repo-clone-copy-public-key"
                >
                  <Icon name="copy" size="small" />
                  {copyLabel()}
                </Button>
              </div>

              <div
                class="mt-3 rounded-md border border-border-weak-base bg-surface-warning-base/20 p-3"
                data-action="repo-clone-security-hygiene"
              >
                <div class="text-12-medium text-text-strong">Recommended security hygiene</div>
                <ul class="mt-1 list-disc pl-5 text-12-regular text-text-weak">
                  <li>Add this public key only to the git accounts you need.</li>
                  <li>Prefer a passphrase for long-lived or shared opencode instances.</li>
                  <li>Use separate keys per environment or instance.</li>
                  <li>Rotate or revoke stale keys and remove old keys in Settings &gt; Repositories.</li>
                  <li>Treat the opencode host as a key-holding machine: keep access tight and software updated.</li>
                  <li>
                    For cloud-hosted usage, enforce strong account security (for example TOTP) and minimize sharing.
                  </li>
                </ul>
              </div>
            </div>
          )}
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
            disabled={isCloning() || isHttpUrl() || missingSshKeys()}
            data-action="repo-clone-submit"
          >
            {isCloning() ? "Cloning..." : "Clone"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
