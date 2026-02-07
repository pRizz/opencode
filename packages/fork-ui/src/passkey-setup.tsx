import { For, Show, createSignal, onMount } from "solid-js"

type PasskeySetupBootstrap = {
  username?: string
  required?: boolean
  canSkip?: boolean
  returnTo?: string
}

type PasskeyCreationOptionsJSON = {
  challenge: string
  rp: PublicKeyCredentialRpEntity
  user: {
    id: string
    name: string
    displayName: string
  }
  pubKeyCredParams: PublicKeyCredentialParameters[]
  timeout?: number
  excludeCredentials?: Array<{
    id: string
    type?: PublicKeyCredentialType
    transports?: AuthenticatorTransport[]
  }>
  authenticatorSelection?: AuthenticatorSelectionCriteria
  attestation?: AttestationConveyancePreference
  extensions?: AuthenticationExtensionsClientInputs
}

type Passkey = {
  credentialId: string
  deviceLabel: string
  createdAt: number
  lastUsedAt?: number
  transports: string[]
}

type PasskeyRegistrationStage = "register_options_request" | "credential_create" | "register_verify_request"

declare global {
  interface Window {
    __OPENCODE_PASSKEY_SETUP__?: PasskeySetupBootstrap
  }
}

function getCsrfToken(): string {
  const match = document.cookie.match(/opencode_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ""
}

function base64urlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function arrayBufferToBase64url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function parseCreationOptions(options: PasskeyCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  const parser = PublicKeyCredential as typeof PublicKeyCredential & {
    parseCreationOptionsFromJSON?: (input: PasskeyCreationOptionsJSON) => PublicKeyCredentialCreationOptions
  }
  if (typeof parser.parseCreationOptionsFromJSON === "function") {
    return parser.parseCreationOptionsFromJSON(options)
  }

  return {
    rp: options.rp,
    user: {
      ...options.user,
      id: base64urlToArrayBuffer(options.user.id),
    },
    challenge: base64urlToArrayBuffer(options.challenge),
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    authenticatorSelection: options.authenticatorSelection,
    attestation: options.attestation,
    extensions: options.extensions,
    excludeCredentials: options.excludeCredentials?.map((item) => ({
      id: base64urlToArrayBuffer(item.id),
      type: item.type ?? "public-key",
      transports: item.transports,
    })),
  }
}

function isAttestationResponse(response: AuthenticatorResponse): response is AuthenticatorAttestationResponse {
  return "attestationObject" in response
}

function toRegistrationResponseJSON(credential: PublicKeyCredential): Record<string, unknown> | null {
  const jsonCredential = credential as PublicKeyCredential & { toJSON?: () => unknown }
  if (typeof jsonCredential.toJSON === "function") {
    const payload = jsonCredential.toJSON()
    if (payload && typeof payload === "object") {
      return payload as Record<string, unknown>
    }
  }

  if (!isAttestationResponse(credential.response)) return null

  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
      attestationObject: arrayBufferToBase64url(credential.response.attestationObject),
      transports: credential.response.getTransports?.() ?? [],
    },
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
  }
}

function formatTime(value: number | undefined): string {
  if (!value) return "Never used"
  return new Date(value).toLocaleString()
}

function mapPasskeySetupError(error: unknown, stage: PasskeyRegistrationStage): string {
  const fallback = "Passkey setup failed."
  if (!(error instanceof Error)) return fallback

  const errorName = (error as { name?: string }).name ?? ""
  const errorMessage = error.message ?? ""
  const lowered = errorMessage.toLowerCase()

  if (errorName === "SecurityError" && lowered.includes("invalid domain")) {
    const localhostOrigin = `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ""}`
    return `Passkeys are not supported on ${window.location.hostname}. Open ${localhostOrigin} and try again.`
  }
  if (errorName === "NotAllowedError") {
    return "Passkey setup was cancelled or timed out. Try again and approve the browser prompt."
  }
  if (errorName === "InvalidStateError") {
    return "This passkey may already be registered. Try a different authenticator."
  }
  if (errorName === "NotSupportedError") {
    return "This browser or authenticator does not support creating passkeys."
  }
  if (stage === "register_options_request") return "Could not start passkey setup."
  if (stage === "register_verify_request") return "Passkey was created but verification failed. Try again."
  return errorMessage || fallback
}

function logPasskeySetupFailure(input: {
  stage: PasskeyRegistrationStage
  error?: unknown
  rpID?: string
  optionsStatus?: number
  optionsMessage?: string
  verifyStatus?: number
  verifyMessage?: string
}): void {
  const errorName =
    input.error && typeof input.error === "object" && "name" in input.error
      ? String((input.error as { name?: unknown }).name ?? "UnknownError")
      : undefined
  const errorMessage =
    input.error && typeof input.error === "object" && "message" in input.error
      ? String((input.error as { message?: unknown }).message ?? "")
      : undefined

  // Keep diagnostics structured so browser consoles show the exact failing stage.
  console.error("[passkey-setup] registration failed", {
    stage: input.stage,
    errorName,
    errorMessage,
    origin: window.location.origin,
    hostname: window.location.hostname,
    isSecureContext: window.isSecureContext,
    rpID: input.rpID,
    optionsStatus: input.optionsStatus,
    optionsMessage: input.optionsMessage,
    verifyStatus: input.verifyStatus,
    verifyMessage: input.verifyMessage,
  })
}

export function PasskeySetupApp() {
  const bootstrap = window.__OPENCODE_PASSKEY_SETUP__ ?? {}
  const required = Boolean(bootstrap.required)
  const canSkip = bootstrap.canSkip !== false
  const returnTo = bootstrap.returnTo || "/"

  const [passkeys, setPasskeys] = createSignal<Passkey[]>([])
  const [loading, setLoading] = createSignal(true)
  const [working, setWorking] = createSignal(false)
  const [removing, setRemoving] = createSignal<string | undefined>(undefined)
  const [error, setError] = createSignal("")
  const [status, setStatus] = createSignal("")

  const loadPasskeys = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/auth/passkey/list", {
        credentials: "include",
      })
      const body = (await res.json().catch(() => ({}))) as { credentials?: Passkey[]; message?: string }
      if (!res.ok) {
        setPasskeys([])
        setError(body.message ?? "Unable to load passkeys")
        return
      }
      setPasskeys(body.credentials ?? [])
    } catch {
      setPasskeys([])
      setError("Unable to load passkeys")
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    void loadPasskeys()
  })

  const registerPasskey = async () => {
    if (working()) return

    if (typeof PublicKeyCredential === "undefined" || typeof navigator.credentials === "undefined") {
      setError("This browser does not support passkeys.")
      return
    }

    setWorking(true)
    setError("")
    setStatus("")
    let stage: PasskeyRegistrationStage = "register_options_request"
    let rpID: string | undefined
    let optionsStatus: number | undefined
    let optionsMessage: string | undefined
    let verifyStatus: number | undefined
    let verifyMessage: string | undefined

    try {
      const csrfToken = getCsrfToken()
      const optionsRes = await fetch("/auth/passkey/register/options", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({}),
      })
      const optionsBody = (await optionsRes.json().catch(() => ({}))) as {
        success?: boolean
        challengeToken?: string
        options?: PasskeyCreationOptionsJSON
        message?: string
      }
      optionsStatus = optionsRes.status
      optionsMessage = optionsBody.message
      if (typeof optionsBody.options?.rp?.id === "string") {
        rpID = optionsBody.options.rp.id
      }
      if (!optionsRes.ok || !optionsBody.success || !optionsBody.challengeToken || !optionsBody.options) {
        const message = optionsBody.message ?? "Could not start passkey setup."
        setError(message)
        logPasskeySetupFailure({
          stage,
          rpID,
          optionsStatus,
          optionsMessage: optionsMessage ?? message,
        })
        return
      }

      stage = "credential_create"
      const credential = await navigator.credentials.create({
        publicKey: parseCreationOptions(optionsBody.options),
      })
      if (!(credential instanceof PublicKeyCredential)) {
        const message = "Passkey setup was cancelled."
        setError(message)
        logPasskeySetupFailure({
          stage,
          rpID,
          optionsStatus,
          optionsMessage,
          verifyStatus,
          verifyMessage: message,
        })
        return
      }

      const response = toRegistrationResponseJSON(credential)
      if (!response) {
        const message = "Your browser returned an unsupported passkey response."
        setError(message)
        logPasskeySetupFailure({
          stage,
          rpID,
          optionsStatus,
          optionsMessage,
          verifyStatus,
          verifyMessage: message,
        })
        return
      }

      stage = "register_verify_request"
      const verifyRes = await fetch("/auth/passkey/register/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({
          challengeToken: optionsBody.challengeToken,
          response,
        }),
      })
      const verifyBody = (await verifyRes.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        redirectTo?: string
      }
      verifyStatus = verifyRes.status
      verifyMessage = verifyBody.message
      if (!verifyRes.ok || !verifyBody.success) {
        const message = verifyBody.message ?? "Passkey setup failed."
        setError(message)
        logPasskeySetupFailure({
          stage,
          rpID,
          optionsStatus,
          optionsMessage,
          verifyStatus,
          verifyMessage: verifyMessage ?? message,
        })
        return
      }

      if (required && verifyBody.redirectTo) {
        window.location.href = verifyBody.redirectTo
        return
      }

      setStatus("Passkey added successfully.")
      await loadPasskeys()
    } catch (error) {
      const message = mapPasskeySetupError(error, stage)
      setError(message)
      logPasskeySetupFailure({
        stage,
        error,
        rpID,
        optionsStatus,
        optionsMessage,
        verifyStatus,
        verifyMessage,
      })
    } finally {
      setWorking(false)
    }
  }

  const removePasskey = async (credentialId: string) => {
    if (working()) return
    setRemoving(credentialId)
    setError("")
    setStatus("")

    try {
      const csrfToken = getCsrfToken()
      const res = await fetch("/auth/passkey/remove", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({ credentialId }),
      })
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string }
      if (!res.ok || !body.success) {
        setError(body.message ?? "Could not remove passkey.")
        return
      }

      setStatus("Passkey removed.")
      await loadPasskeys()
    } catch {
      setError("Could not remove passkey.")
    } finally {
      setRemoving(undefined)
    }
  }

  const continueDisabled = () => required && passkeys().length === 0

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #0a0a0a;
          color: #e5e5e5;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .card {
          width: 100%;
          max-width: 520px;
          background: #141414;
          border: 1px solid #262626;
          border-radius: 12px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        h1 {
          font-size: 1.2rem;
        }
        .subtitle {
          font-size: 0.82rem;
          color: #a3a3a3;
          line-height: 1.4;
        }
        .required-banner {
          background: rgba(14,165,233,0.12);
          border: 1px solid rgba(14,165,233,0.45);
          border-radius: 8px;
          padding: 0.75rem;
          color: #bae6fd;
          font-size: 0.8rem;
          line-height: 1.4;
        }
        .error {
          border: 1px solid rgba(239,68,68,0.35);
          background: rgba(239,68,68,0.15);
          border-radius: 8px;
          padding: 0.75rem;
          color: #fca5a5;
          font-size: 0.8rem;
        }
        .success {
          border: 1px solid rgba(34,197,94,0.35);
          background: rgba(34,197,94,0.15);
          border-radius: 8px;
          padding: 0.75rem;
          color: #86efac;
          font-size: 0.8rem;
        }
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }
        .muted {
          font-size: 0.78rem;
          color: #a3a3a3;
        }
        .list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 40vh;
          overflow-y: auto;
        }
        .item {
          border: 1px solid #2a2a2a;
          border-radius: 8px;
          padding: 0.75rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .item-title {
          font-size: 0.86rem;
          color: #e5e5e5;
        }
        .item-meta {
          font-size: 0.74rem;
          color: #a3a3a3;
          line-height: 1.5;
        }
        button {
          height: 36px;
          border-radius: 8px;
          border: 1px solid transparent;
          padding: 0 0.9rem;
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 600;
          background: #e5e5e5;
          color: #0a0a0a;
        }
        button.secondary {
          background: transparent;
          color: #d4d4d4;
          border-color: #3f3f46;
        }
        button.ghost {
          background: transparent;
          color: #a3a3a3;
          border-color: #2a2a2a;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          border-top: 1px solid #2a2a2a;
          padding-top: 0.75rem;
        }
      `}</style>
      <div class="card">
        <h1>Set up passkeys</h1>
        <div class="subtitle">
          Add one or more passkeys for <strong>{bootstrap.username || "this account"}</strong>. You can use passkeys
          instead of typing a password.
        </div>

        <Show when={required}>
          <div class="required-banner">
            Passkey setup is required to finish initial account setup. Add at least one passkey to continue.
          </div>
        </Show>

        <Show when={Boolean(error())}>
          <div class="error">{error()}</div>
        </Show>
        <Show when={Boolean(status())}>
          <div class="success">{status()}</div>
        </Show>

        <div class="toolbar">
          <div class="muted">{loading() ? "Loading passkeys..." : `${passkeys().length} passkey(s) registered`}</div>
          <button disabled={working()} onClick={() => void registerPasskey()}>
            {working() ? "Adding..." : "Add passkey"}
          </button>
        </div>

        <Show when={!loading()} fallback={<div class="muted">Loading passkeys...</div>}>
          <Show when={passkeys().length > 0} fallback={<div class="muted">No passkeys registered yet.</div>}>
            <div class="list">
              <For each={passkeys()}>
                {(item) => (
                  <div class="item">
                    <div>
                      <div class="item-title">{item.deviceLabel}</div>
                      <div class="item-meta">Added: {formatTime(item.createdAt)}</div>
                      <div class="item-meta">Last used: {formatTime(item.lastUsedAt)}</div>
                      <Show when={item.transports.length > 0}>
                        <div class="item-meta">Transports: {item.transports.join(", ")}</div>
                      </Show>
                    </div>
                    <button
                      class="ghost"
                      disabled={Boolean(removing()) || (required && passkeys().length <= 1)}
                      onClick={() => void removePasskey(item.credentialId)}
                    >
                      {removing() === item.credentialId ? "Removing..." : "Remove"}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <div class="actions">
          <Show when={canSkip && !required}>
            <button class="ghost" onClick={() => (window.location.href = returnTo)}>
              Skip for now
            </button>
          </Show>
          <button class="secondary" disabled={continueDisabled()} onClick={() => (window.location.href = returnTo)}>
            Continue
          </button>
        </div>
      </div>
    </>
  )
}
