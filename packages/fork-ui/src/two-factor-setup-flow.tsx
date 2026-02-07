import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Button } from "@opencode-ai/ui/button"

export type TwoFactorSetupBootstrap = {
  username: string
  secret: string
  qrCodeSvg: string
  setupCommand?: string
  alreadyConfigured: boolean
  required?: boolean
  setupStatus: "pending_verification" | "already_configured" | "manual_required"
  setupMessage?: string
}

interface TwoFactorSetupFlowProps {
  bootstrap?: TwoFactorSetupBootstrap
  getServerUrl?: () => string | undefined
  embedded?: boolean
  onConfigured?: () => void
}

function getCsrfToken(): string {
  const cookies = document.cookie.split("; ")
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=")
    if (name.trim() === "opencode_csrf") {
      return decodeURIComponent(valueParts.join("="))
    }
  }
  return ""
}

function buildUrl(getServerUrl: (() => string | undefined) | undefined, path: string): string {
  const base = getServerUrl?.()
  return base ? `${base}${path}` : path
}

export function TwoFactorSetupFlow(props: TwoFactorSetupFlowProps) {
  const embedded = () => props.embedded === true
  const [bootstrap, setBootstrap] = createSignal<TwoFactorSetupBootstrap | undefined>(props.bootstrap)
  const [loadingBootstrap, setLoadingBootstrap] = createSignal(!props.bootstrap && embedded())

  const [code, setCode] = createSignal("")
  const [error, setError] = createSignal("")
  const [success, setSuccess] = createSignal("")
  const [submitting, setSubmitting] = createSignal(false)
  const [skipSubmitting, setSkipSubmitting] = createSignal(false)
  const [disableSubmitting, setDisableSubmitting] = createSignal(false)
  const [copyLabel, setCopyLabel] = createSignal("Copy")
  const [redirectSeconds, setRedirectSeconds] = createSignal(3)
  const [redirecting, setRedirecting] = createSignal(false)

  let redirectTimer: number | undefined

  onCleanup(() => {
    if (redirectTimer) {
      window.clearInterval(redirectTimer)
    }
  })

  const setupData = createMemo(() => bootstrap())
  const alreadyConfigured = createMemo(() => {
    const current = setupData()
    if (!current) return false
    return current.setupStatus === "already_configured" || Boolean(current.alreadyConfigured)
  })
  const required = createMemo(() => Boolean(setupData()?.required))
  const manualRequired = createMemo(() => setupData()?.setupStatus === "manual_required")

  const loadInlineBootstrap = async () => {
    if (!embedded() || bootstrap()) return

    setLoadingBootstrap(true)
    setError("")

    try {
      const csrf = getCsrfToken()
      const res = await fetch(buildUrl(props.getServerUrl, "/auth/2fa/setup/start"), {
        method: "POST",
        credentials: "include",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
      })

      const body = (await res.json().catch(() => ({}))) as Partial<TwoFactorSetupBootstrap> & { message?: string }
      if (!res.ok) {
        setError(body.message ?? "Unable to start 2FA setup.")
        return
      }

      if (!body.secret || !body.qrCodeSvg || !body.username || !body.setupStatus) {
        setError("2FA setup response was incomplete.")
        return
      }

      setBootstrap({
        username: body.username,
        secret: body.secret,
        qrCodeSvg: body.qrCodeSvg,
        setupCommand: body.setupCommand,
        alreadyConfigured: Boolean(body.alreadyConfigured),
        required: Boolean(body.required),
        setupStatus: body.setupStatus,
        setupMessage: body.setupMessage,
      })
    } catch {
      setError("Unable to start 2FA setup.")
    } finally {
      setLoadingBootstrap(false)
    }
  }

  onMount(() => {
    if (embedded() && !props.bootstrap) {
      void loadInlineBootstrap()
    }
  })

  const handleCodeInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
    const cleaned = event.currentTarget.value.replace(/\D/g, "").trim().slice(0, 8)
    if (cleaned !== event.currentTarget.value) {
      event.currentTarget.value = cleaned
    }
    setCode(cleaned)
    setError("")

    if (cleaned.length === 6) {
      event.currentTarget.form?.requestSubmit()
    }
  }

  const startRedirectCountdown = () => {
    setRedirecting(true)
    setRedirectSeconds(3)
    redirectTimer = window.setInterval(() => {
      setRedirectSeconds((remaining) => {
        if (remaining <= 1) {
          if (redirectTimer) window.clearInterval(redirectTimer)
          window.location.href = "/"
          return 0
        }
        return remaining - 1
      })
    }, 1000)
  }

  const handleSubmit = async (event: Event) => {
    event.preventDefault()
    if (submitting()) return

    const setup = setupData()
    if (!setup) {
      setError("Unable to start 2FA setup.")
      return
    }

    const value = code().trim()
    if (!value || value.length < 6) {
      setError("Please enter a valid 6-digit code.")
      return
    }

    setSubmitting(true)
    setError("")
    setSuccess("")

    try {
      const res = await fetch(buildUrl(props.getServerUrl, "/auth/2fa/verify"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ code: value }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        setError(
          body.message ||
            (manualRequired()
              ? "Invalid code - make sure you ran the setup command first."
              : "Invalid code - make sure your authenticator is set up."),
        )
        setSubmitting(false)
        setCode("")
        return
      }

      if (embedded()) {
        setSuccess("2FA has been enabled.")
        setCode("")
        setSubmitting(false)
        await props.onConfigured?.()
        return
      }

      setSuccess("Verified. Redirecting...")
      startRedirectCountdown()
    } catch {
      setError("Connection error")
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (skipSubmitting()) return
    setSkipSubmitting(true)
    setError("")

    try {
      const res = await fetch(buildUrl(props.getServerUrl, "/auth/2fa/skip"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": getCsrfToken(),
        },
      })

      if (res.ok) {
        window.location.href = "/"
        return
      }

      const data = (await res.json().catch(() => ({}))) as { message?: string }
      setError(data.message || "Failed to skip setup.")
      setSkipSubmitting(false)
    } catch {
      setError("Connection error")
      setSkipSubmitting(false)
    }
  }

  const handleDisable = async () => {
    if (disableSubmitting()) return
    setDisableSubmitting(true)
    setError("")

    try {
      const res = await fetch(buildUrl(props.getServerUrl, "/auth/2fa/disable"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": getCsrfToken(),
        },
      })

      if (res.ok) {
        window.location.href = "/"
        return
      }

      const data = (await res.json().catch(() => ({}))) as { message?: string }
      setError(data.message || "Failed to disable 2FA.")
      setDisableSubmitting(false)
    } catch {
      setError("Connection error")
      setDisableSubmitting(false)
    }
  }

  const handleCopy = async () => {
    const value = setupData()?.setupCommand
    if (!value) return

    const markCopied = () => {
      setCopyLabel("Copied!")
      window.setTimeout(() => setCopyLabel("Copy"), 2000)
    }

    try {
      await navigator.clipboard.writeText(value)
      markCopied()
      return
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = value
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      try {
        document.execCommand("copy")
        markCopied()
      } finally {
        document.body.removeChild(textarea)
      }
    }
  }

  const formDisabled = createMemo(() => submitting() || alreadyConfigured() || redirecting())

  return (
    <>
      <Show when={!embedded()}>
        <style>{`
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0a0a0a;
            color: #e5e5e5;
            min-height: 100vh;
            margin: 0;
            padding: 2rem;
            display: flex;
            justify-content: center;
          }
          .two-factor-page { width: 100%; max-width: 520px; }
          .two-factor-card {
            background: #141414;
            border: 1px solid #262626;
            border-radius: 12px;
            padding: 1.5rem;
          }
          .two-factor-input {
            width: 100%;
            height: 44px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #1a1a1a;
            color: #e5e5e5;
            font-size: 20px;
            text-align: center;
            letter-spacing: 0.25em;
          }
          .two-factor-input:focus {
            outline: none;
            border-color: #525252;
            box-shadow: 0 0 0 2px rgba(82, 82, 82, 0.3);
          }
          .two-factor-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
        `}</style>
      </Show>

      <div class={embedded() ? "flex flex-col gap-3" : "two-factor-page"}>
        <div class={embedded() ? "rounded-lg border border-border-weak-base p-4" : "two-factor-card"}>
          <div class="text-15-medium text-text-strong">Setup 2FA</div>
          <Show when={setupData()} fallback={<div class="mt-2 text-13-regular text-text-weak">Preparing setup...</div>}>
            {(setup) => (
              <>
                <Show when={required() && !embedded()}>
                  <div class="mt-3 rounded-md border border-info-weak-base bg-info-weak-base/30 p-3 text-12-regular text-info-strong">
                    Two-factor authentication is required for this account.
                  </div>
                </Show>

                <Show when={setup().setupMessage}>
                  <div class="mt-3 rounded-md border border-border-weak-base p-3 text-12-regular text-text-weak">
                    {setup().setupMessage}
                  </div>
                </Show>

                <Show when={loadingBootstrap()}>
                  <div class="mt-3 text-13-regular text-text-weak">Loading setup details...</div>
                </Show>

                <Show when={Boolean(setup().qrCodeSvg)}>
                  <div class="mt-3 flex justify-center rounded-md border border-border-weak-base bg-white p-3">
                    <div innerHTML={setup().qrCodeSvg} />
                  </div>
                </Show>

                <Show when={setup().setupCommand}>
                  <div class="mt-3 rounded-md border border-border-weak-base p-3">
                    <div class="text-12-medium text-text-strong">Manual setup command</div>
                    <div class="mt-1 overflow-x-auto rounded bg-background-base px-2 py-1 font-mono text-12-regular text-text-weak">
                      {setup().setupCommand}
                    </div>
                    <div class="mt-2 flex justify-end">
                      <Button size="small" variant="ghost" onClick={() => void handleCopy()}>
                        {copyLabel()}
                      </Button>
                    </div>
                  </div>
                </Show>

                <form class="mt-3 flex flex-col gap-2" onSubmit={(event) => void handleSubmit(event)}>
                  <label class="text-12-medium text-text-weak" for="two-factor-setup-code">
                    Enter the 6-digit code from your authenticator app
                  </label>
                  <input
                    id="two-factor-setup-code"
                    class={embedded() ? "h-10 rounded-md border border-border-weak-base bg-background-base px-3 text-14-medium" : "two-factor-input"}
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    maxlength="8"
                    autocomplete="one-time-code"
                    value={code()}
                    onInput={handleCodeInput}
                    disabled={formDisabled()}
                  />
                  <div class="flex justify-end">
                    <Button size="small" variant="secondary" disabled={formDisabled()}>
                      {submitting() ? "Verifying..." : "Verify & Enable 2FA"}
                    </Button>
                  </div>
                </form>

                <Show when={success()}>
                  <div class="mt-3 rounded-md border border-success-weak-base bg-success-weak-base/40 p-3 text-12-regular text-success-strong">
                    {success()} <Show when={redirecting() && !embedded()}>Redirecting in {redirectSeconds()}...</Show>
                  </div>
                </Show>

                <Show when={error()}>
                  <div class="mt-3 rounded-md border border-error-weak-base bg-error-weak-base/40 p-3 text-12-regular text-error-strong">
                    {error()}
                  </div>
                </Show>

                <Show when={!embedded() && !required() && !alreadyConfigured()}>
                  <div class="two-factor-actions">
                    <Button size="small" variant="ghost" onClick={() => void handleSkip()} disabled={skipSubmitting()}>
                      {skipSubmitting() ? "Skipping..." : "Skip for now"}
                    </Button>
                    <Button size="small" variant="ghost" onClick={() => void handleDisable()} disabled={disableSubmitting()}>
                      {disableSubmitting() ? "Disabling..." : "Never ask me"}
                    </Button>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
