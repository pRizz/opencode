import { For, Show, createSignal, onMount } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"

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
  aaguid?: string
}

interface PasskeyManagerDialogProps {
  onUpdate?: () => void
  getServerUrl: () => string | undefined
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

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/opencode_csrf=([^;]+)/)
  return match ? match[1] : undefined
}

function formatTime(value: number | undefined): string {
  if (!value) return "Never used"
  return new Date(value).toLocaleString()
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

export function PasskeyManagerDialog(props: PasskeyManagerDialogProps) {
  const dialog = useDialog()
  const [passkeys, setPasskeys] = createSignal<Passkey[]>([])
  const [loading, setLoading] = createSignal(true)
  const [working, setWorking] = createSignal(false)
  const [removing, setRemoving] = createSignal<string | undefined>(undefined)
  const [error, setError] = createSignal<string>("")

  const load = async () => {
    const url = props.getServerUrl()
    if (!url) return

    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${url}/auth/passkey/list`, {
        credentials: "include",
      })
      const body = (await res.json().catch(() => ({}))) as { credentials?: Passkey[]; message?: string }
      if (!res.ok) {
        setError(body.message ?? "Unable to load passkeys")
        setPasskeys([])
        return
      }
      setPasskeys(body.credentials ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load passkeys"
      setError(message)
      setPasskeys([])
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    void load()
  })

  const registerPasskey = async () => {
    if (working()) return

    const url = props.getServerUrl()
    if (!url) return

    if (typeof PublicKeyCredential === "undefined" || typeof navigator.credentials === "undefined") {
      showToast({
        title: "Passkeys unavailable",
        description: "This browser does not support passkeys.",
      })
      return
    }

    setWorking(true)
    setError("")
    try {
      const csrfToken = getCsrfToken()
      const optionsRes = await fetch(`${url}/auth/passkey/register/options`, {
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

      if (!optionsRes.ok || !optionsBody.success || !optionsBody.challengeToken || !optionsBody.options) {
        showToast({
          title: "Could not start passkey setup",
          description: optionsBody.message ?? "Try again in a moment.",
        })
        return
      }

      const credential = await navigator.credentials.create({
        publicKey: parseCreationOptions(optionsBody.options),
      })

      if (!(credential instanceof PublicKeyCredential)) {
        showToast({
          title: "Passkey setup cancelled",
          description: "No credential was created.",
        })
        return
      }

      const response = toRegistrationResponseJSON(credential)
      if (!response) {
        showToast({
          title: "Passkey setup failed",
          description: "Your browser returned an unsupported response.",
        })
        return
      }

      const verifyRes = await fetch(`${url}/auth/passkey/register/verify`, {
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
      }

      if (!verifyRes.ok || !verifyBody.success) {
        showToast({
          title: "Passkey setup failed",
          description: verifyBody.message ?? "Try again.",
        })
        return
      }

      showToast({
        title: "Passkey added",
        description: "Your passkey is ready to use for sign-in.",
      })
      await load()
      props.onUpdate?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Passkey setup failed"
      showToast({
        title: "Passkey setup failed",
        description: message,
      })
    } finally {
      setWorking(false)
    }
  }

  const removePasskey = async (credentialId: string) => {
    if (working()) return

    const url = props.getServerUrl()
    if (!url) return

    setRemoving(credentialId)
    setError("")
    try {
      const csrfToken = getCsrfToken()
      const res = await fetch(`${url}/auth/passkey/remove`, {
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
        showToast({
          title: "Could not remove passkey",
          description: body.message ?? "Try again.",
        })
        return
      }

      showToast({
        title: "Passkey removed",
        description: "The selected passkey has been deleted.",
      })
      await load()
      props.onUpdate?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove passkey"
      showToast({
        title: "Could not remove passkey",
        description: message,
      })
    } finally {
      setRemoving(undefined)
    }
  }

  return (
    <Dialog title="Manage passkeys" description="Add and remove WebAuthn passkeys for this account.">
      <div class="flex max-h-[70vh] min-w-[420px] flex-col gap-4 overflow-y-auto px-2 pb-3">
        <div class="rounded-md border border-border-weak-base p-3 text-13-regular text-text-weak">
          Passkeys let you sign in without typing your password. They are tied to your device or password manager.
        </div>

        <div class="flex justify-end">
          <Button size="large" variant="secondary" disabled={working()} onClick={registerPasskey}>
            {working() ? "Adding..." : "Add passkey"}
          </Button>
        </div>

        <Show when={!loading()} fallback={<div class="text-13-regular text-text-weak">Loading passkeys...</div>}>
          <Show when={Boolean(error())}>
            <div class="rounded-md border border-error-weak-base bg-error-weak-base/40 p-3 text-13-regular text-error-strong">
              {error()}
            </div>
          </Show>

          <Show
            when={passkeys().length > 0}
            fallback={<div class="text-13-regular text-text-weak">No passkeys registered yet.</div>}
          >
            <div class="flex flex-col gap-2">
              <For each={passkeys()}>
                {(item) => (
                  <div class="flex items-start justify-between gap-3 rounded-md border border-border-weak-base p-3">
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-14-medium text-text-strong">{item.deviceLabel}</div>
                      <div class="text-12-regular text-text-weak">Added: {formatTime(item.createdAt)}</div>
                      <div class="text-12-regular text-text-weak">Last used: {formatTime(item.lastUsedAt)}</div>
                      <Show when={item.transports.length > 0}>
                        <div class="text-12-regular text-text-weak">Transports: {item.transports.join(", ")}</div>
                      </Show>
                    </div>
                    <Button
                      size="small"
                      variant="ghost"
                      disabled={Boolean(removing())}
                      onClick={() => void removePasskey(item.credentialId)}
                    >
                      {removing() === item.credentialId ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <div class="flex justify-end gap-2 pt-2">
          <Button size="large" variant="ghost" onClick={() => dialog.close()}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
