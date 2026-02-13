import { Show, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"

type LoginBootstrap = {
  shouldBlock?: boolean
  bootstrap?: {
    active?: boolean
    available?: boolean
  }
}

type PasskeyRequestOptionsJSON = {
  challenge: string
  timeout?: number
  rpId?: string
  allowCredentials?: Array<{
    id: string
    type?: PublicKeyCredentialType
    transports?: AuthenticatorTransport[]
  }>
  userVerification?: UserVerificationRequirement
  extensions?: AuthenticationExtensionsClientInputs
}

type PasskeyAuthOptionsResult = {
  success: true
  options: PasskeyRequestOptionsJSON
  challengeToken: string
}

type PasskeyLoginMode = "manual" | "conditional"
type PasskeyLoginStage = "auth_options_request" | "credential_get" | "auth_verify_request"
type PasskeyRequestFailure = {
  ok: false
  message: string
}
type PasskeyOptionsResponse =
  | {
      ok: true
      data: PasskeyAuthOptionsResult
    }
  | PasskeyRequestFailure
type PasskeyVerifyResponse = { ok: true } | PasskeyRequestFailure

declare global {
  interface Window {
    __OPENCODE_LOGIN__?: LoginBootstrap
  }
}

const HTTP_WARNING_KEY = "http-warning-dismissed"
const LOOPBACK_REDIRECTED_QUERY_PARAM = "oc_loopback_redirected"
const LOOPBACK_REDIRECT_FROM_QUERY_PARAM = "oc_loopback_from"

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .replace(/^\[(.*)\]$/, "$1")
    .toLowerCase()
}

function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return (
    normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1"
  )
}

function shouldWarnForHttpConnection(): boolean {
  return window.location.protocol === "http:" && !isLocalHostname(window.location.hostname)
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

function parseRequestOptions(options: PasskeyRequestOptionsJSON): PublicKeyCredentialRequestOptions {
  const parser = PublicKeyCredential as typeof PublicKeyCredential & {
    parseRequestOptionsFromJSON?: (input: PasskeyRequestOptionsJSON) => PublicKeyCredentialRequestOptions
  }

  if (typeof parser.parseRequestOptionsFromJSON === "function") {
    return parser.parseRequestOptionsFromJSON(options)
  }

  return {
    challenge: base64urlToArrayBuffer(options.challenge),
    timeout: options.timeout,
    rpId: options.rpId,
    userVerification: options.userVerification,
    extensions: options.extensions,
    allowCredentials: options.allowCredentials?.map((item) => ({
      id: base64urlToArrayBuffer(item.id),
      type: item.type ?? "public-key",
      transports: item.transports,
    })),
  }
}

function isAssertionResponse(response: AuthenticatorResponse): response is AuthenticatorAssertionResponse {
  return "authenticatorData" in response && "signature" in response
}

function toAuthenticationResponseJSON(credential: PublicKeyCredential): Record<string, unknown> | null {
  const jsonCredential = credential as PublicKeyCredential & { toJSON?: () => unknown }
  if (typeof jsonCredential.toJSON === "function") {
    const payload = jsonCredential.toJSON()
    if (payload && typeof payload === "object") {
      return payload as Record<string, unknown>
    }
  }

  if (!isAssertionResponse(credential.response)) return null

  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
      authenticatorData: arrayBufferToBase64url(credential.response.authenticatorData),
      signature: arrayBufferToBase64url(credential.response.signature),
      userHandle: credential.response.userHandle ? arrayBufferToBase64url(credential.response.userHandle) : undefined,
    },
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
  }
}

function isPasskeySupported() {
  return typeof window.PublicKeyCredential !== "undefined" && typeof navigator.credentials !== "undefined"
}

function getPasskeyClientHeaders(): Record<string, string> {
  return {
    "X-Opencode-Secure-Context": window.isSecureContext ? "1" : "0",
    "X-Opencode-Window-Origin": window.location.origin,
  }
}

function getPasskeyApiMessage(message: string | undefined): string {
  if (!window.isSecureContext) {
    return message || "Passkey sign-in is unavailable"
  }
  return (
    "Browser reports a secure context, but the server rejected HTTPS detection. " +
    "Check auth.trustProxy and ensure your reverse proxy forwards Forwarded or X-Forwarded-Proto."
  )
}

function passkeyErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError", message: String(error) }
  return { name: error.name, message: error.message }
}

function isExpectedPasskeyCancelError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.name === "AbortError" || error.name === "NotAllowedError"
}

function mapPasskeyLoginError(input: {
  error: unknown
  stage: PasskeyLoginStage
  mode: PasskeyLoginMode
  hasUsername: boolean
}): string | undefined {
  if (!(input.error instanceof Error)) {
    if (input.mode === "conditional") {
      return 'Automatic passkey sign-in failed. Use "Sign in with passkey" to retry or sign in with username and password.'
    }
    return input.hasUsername
      ? "Passkey authentication failed. Try again or sign in with your password."
      : "No passkey found. Enter a username and try again."
  }

  if (isExpectedPasskeyCancelError(input.error)) return undefined

  const errorName = input.error.name
  const errorMessage = input.error.message.toLowerCase()

  if (errorName === "SecurityError" && errorMessage.includes("invalid domain")) {
    const localhostOrigin = `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ""}`
    return `Passkeys are not supported on ${window.location.hostname}. Open ${localhostOrigin} and try again.`
  }
  if (errorName === "NotSupportedError") {
    return "This browser or authenticator does not support passkey sign-in."
  }
  if (errorName === "InvalidStateError") {
    return "This passkey could not be used for this account. Try another passkey or sign in with your password."
  }
  if (input.stage === "auth_options_request") {
    return 'Could not start passkey sign-in. Use "Sign in with passkey" to retry or sign in with username and password.'
  }
  if (input.stage === "auth_verify_request") {
    return "Passkey sign-in could not be verified. Try again or sign in with your password."
  }
  if (input.mode === "conditional") {
    return 'Automatic passkey sign-in failed. Use "Sign in with passkey" to retry or sign in with username and password.'
  }

  return input.hasUsername
    ? "Passkey authentication failed. Try again or sign in with your password."
    : "No passkey found. Enter a username and try again."
}

export function LoginApp() {
  const bootstrap = window.__OPENCODE_LOGIN__ ?? {}
  const shouldWarn = shouldWarnForHttpConnection()
  const shouldBlock = Boolean(bootstrap.shouldBlock)
  const bootstrapActive = Boolean(bootstrap.bootstrap?.active)

  const [state, setState] = createStore({
    username: "",
    password: "",
    rememberMe: true,
    submitting: false,
    submitLabel: "Sign In",
    passkeySubmitting: false,
    passkeyLabel: "Sign in with passkey",
    passkeySupported: false,
    passkeyBanner: "",
    error: "",
    showPassword: false,
    invalidUsername: false,
    invalidPassword: false,
    warningDismissed: false,
    loopbackRedirected: false,
    loopbackRedirectFrom: "loopback IP host",

    bootstrapOtp: "",
    bootstrapOtpVerifying: false,
    bootstrapOtpVerified: false,
    bootstrapOtpError: "",
  })

  let conditionalController: AbortController | undefined

  const abortConditionalPasskeyRequest = () => {
    if (!conditionalController) return
    conditionalController.abort()
    conditionalController = undefined
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search)
    const redirectedFromLoopback = params.get(LOOPBACK_REDIRECTED_QUERY_PARAM) === "1"
    if (redirectedFromLoopback) {
      const fromParam = params.get(LOOPBACK_REDIRECT_FROM_QUERY_PARAM)
      setState({
        loopbackRedirected: true,
        loopbackRedirectFrom: fromParam ? normalizeHostname(fromParam) : "loopback IP host",
      })

      params.delete(LOOPBACK_REDIRECTED_QUERY_PARAM)
      params.delete(LOOPBACK_REDIRECT_FROM_QUERY_PARAM)
      const cleanedQuery = params.toString()
      const cleanedUrl = `${window.location.pathname}${cleanedQuery ? `?${cleanedQuery}` : ""}${window.location.hash}`
      window.history.replaceState(window.history.state, "", cleanedUrl)
    }

    if (shouldWarn && sessionStorage.getItem(HTTP_WARNING_KEY)) {
      setState("warningDismissed", true)
    }

    const supported = isPasskeySupported()
    setState("passkeySupported", supported)

    if (supported && !shouldBlock) {
      void startConditionalPasskey()
    }
  })

  onCleanup(() => {
    abortConditionalPasskeyRequest()
  })

  const dismissWarning = () => {
    sessionStorage.setItem(HTTP_WARNING_KEY, "true")
    setState("warningDismissed", true)
  }

  const setPasskeyBanner = (message: string) => {
    setState("passkeyBanner", message)
  }

  const clearPasskeyBanner = () => {
    setState("passkeyBanner", "")
  }

  const fetchPasskeyOptions = async (input: { username?: string }): Promise<PasskeyOptionsResponse> => {
    try {
      const res = await fetch("/auth/passkey/auth/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...getPasskeyClientHeaders(),
        },
        body: JSON.stringify(input.username ? { username: input.username } : {}),
      })

      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || body.success !== true) {
        const isHttpsMismatch = body.error === "passkey_requires_https"
        const message = isHttpsMismatch
          ? getPasskeyApiMessage(typeof body.message === "string" ? body.message : undefined)
          : (typeof body.message === "string" && body.message) ||
            (input.username ? "Passkey sign-in is unavailable." : "No passkey found. Enter a username and try again.")
        return { ok: false, message }
      }

      return {
        ok: true,
        data: body as unknown as PasskeyAuthOptionsResult,
      }
    } catch {
      return {
        ok: false,
        message: "Could not start passkey sign-in. Check your connection and try again.",
      }
    }
  }

  const verifyPasskey = async (input: {
    credential: PublicKeyCredential
    challengeToken: string
  }): Promise<PasskeyVerifyResponse> => {
    const response = toAuthenticationResponseJSON(input.credential)
    if (!response) {
      return {
        ok: false,
        message: "Unable to read passkey response from this browser.",
      }
    }

    try {
      const res = await fetch("/auth/passkey/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...getPasskeyClientHeaders(),
        },
        body: JSON.stringify({
          challengeToken: input.challengeToken,
          response,
          rememberMe: state.rememberMe,
        }),
      })

      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok && body.success === true) {
        setState("passkeyLabel", "Redirecting...")
        window.location.href = "/"
        return { ok: true }
      }

      const isHttpsMismatch = body.error === "passkey_requires_https"
      const message = isHttpsMismatch
        ? getPasskeyApiMessage(typeof body.message === "string" ? body.message : undefined)
        : (typeof body.message === "string" && body.message) ||
          (state.username.trim()
            ? "Passkey authentication failed. Try again or sign in with your password."
            : "No passkey found. Enter a username and try again.")
      return { ok: false, message }
    } catch {
      return {
        ok: false,
        message: "Could not verify passkey sign-in. Check your connection and try again.",
      }
    }
  }

  const startConditionalPasskey = async () => {
    const helper = PublicKeyCredential as typeof PublicKeyCredential & {
      isConditionalMediationAvailable?: () => Promise<boolean>
    }

    if (typeof helper.isConditionalMediationAvailable !== "function") return

    let available = false
    try {
      available = await helper.isConditionalMediationAvailable()
    } catch {
      return
    }
    if (!available) return

    let stage: PasskeyLoginStage = "auth_options_request"
    const optionsResult = await fetchPasskeyOptions({
      username: state.username.trim() || undefined,
    })
    if (!optionsResult.ok) {
      setPasskeyBanner(optionsResult.message)
      return
    }

    abortConditionalPasskeyRequest()
    const controller = new AbortController()
    conditionalController = controller

    try {
      stage = "credential_get"
      const credential = await navigator.credentials.get({
        publicKey: parseRequestOptions(optionsResult.data.options),
        mediation: "conditional",
        signal: controller.signal,
      })

      if (!(credential instanceof PublicKeyCredential)) return

      stage = "auth_verify_request"
      const verifyResult = await verifyPasskey({
        credential,
        challengeToken: optionsResult.data.challengeToken,
      })
      if (!verifyResult.ok) {
        setPasskeyBanner(verifyResult.message)
      }
    } catch (error) {
      const message = mapPasskeyLoginError({
        error,
        stage,
        mode: "conditional",
        hasUsername: Boolean(state.username.trim()),
      })
      if (!isExpectedPasskeyCancelError(error)) {
        console.warn("[login-passkey] conditional mediation failed", passkeyErrorDetails(error))
      }
      if (message) {
        setPasskeyBanner(message)
      }
    } finally {
      if (conditionalController === controller) {
        conditionalController = undefined
      }
    }
  }

  const handlePasskeyLogin = async () => {
    if (shouldBlock || state.submitting || state.passkeySubmitting) return
    if (!state.passkeySupported) {
      setPasskeyBanner("Passkeys are not supported in this browser.")
      return
    }

    clearPasskeyBanner()
    setState({
      error: "",
      passkeySubmitting: true,
      passkeyLabel: "Waiting for passkey...",
    })
    abortConditionalPasskeyRequest()

    let stage: PasskeyLoginStage = "auth_options_request"
    try {
      const optionsResult = await fetchPasskeyOptions({
        username: state.username.trim() || undefined,
      })

      if (!optionsResult.ok) {
        setPasskeyBanner(optionsResult.message)
        setState({
          passkeySubmitting: false,
          passkeyLabel: "Sign in with passkey",
        })
        return
      }

      stage = "credential_get"
      const credential = await navigator.credentials.get({
        publicKey: parseRequestOptions(optionsResult.data.options),
      })

      if (!(credential instanceof PublicKeyCredential)) {
        setState({
          passkeySubmitting: false,
          passkeyLabel: "Sign in with passkey",
        })
        return
      }

      stage = "auth_verify_request"
      const verifyResult = await verifyPasskey({
        credential,
        challengeToken: optionsResult.data.challengeToken,
      })
      if (!verifyResult.ok) {
        setPasskeyBanner(verifyResult.message)
        setState({
          passkeySubmitting: false,
          passkeyLabel: "Sign in with passkey",
        })
      }
    } catch (error) {
      if (!isExpectedPasskeyCancelError(error)) {
        console.warn("[login-passkey] passkey sign-in failed", passkeyErrorDetails(error))
      }
      const message = mapPasskeyLoginError({
        error,
        stage,
        mode: "manual",
        hasUsername: Boolean(state.username.trim()),
      })
      if (message) {
        setPasskeyBanner(message)
      }
      setState({
        passkeySubmitting: false,
        passkeyLabel: "Sign in with passkey",
      })
    }
  }

  const handleSubmit = async (event: Event) => {
    event.preventDefault()
    if (shouldBlock || state.submitting || state.passkeySubmitting) return

    setState({
      error: "",
      invalidUsername: false,
      invalidPassword: false,
    })

    let valid = true
    if (!state.username.trim()) {
      setState("invalidUsername", true)
      valid = false
    }
    if (!state.password) {
      setState("invalidPassword", true)
      valid = false
    }
    if (!valid) return

    setState({
      submitting: true,
      submitLabel: "Signing in...",
    })

    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          username: state.username,
          password: state.password,
          rememberMe: state.rememberMe,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

      if (res.ok && data.success) {
        setState("submitLabel", "Redirecting...")
        window.location.href = typeof data.redirectTo === "string" && data.redirectTo ? data.redirectTo : "/"
        return
      }

      setState({
        error: (typeof data.message === "string" && data.message) || "Authentication failed",
        submitting: false,
        submitLabel: "Sign In",
      })
    } catch {
      setState({
        error: "Connection error",
        submitting: false,
        submitLabel: "Sign In",
      })
    }
  }

  const handleBootstrapVerify = async (event: Event) => {
    event.preventDefault()
    if (shouldBlock || state.bootstrapOtpVerifying || state.bootstrapOtpVerified) return

    const otp = state.bootstrapOtp.trim()
    if (!otp) {
      setState("bootstrapOtpError", "Initial one-time password is required.")
      return
    }

    setState({
      bootstrapOtpVerifying: true,
      bootstrapOtpError: "",
    })

    try {
      const res = await fetch("/auth/bootstrap/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ otp }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok && data.success) {
        setState({
          bootstrapOtpVerified: true,
          bootstrapOtpVerifying: false,
          bootstrapOtpError: "",
        })
        window.location.href =
          typeof data?.redirectTo === "string" && data.redirectTo ? data.redirectTo : "/auth/passkey/setup?required=1"
        return
      }

      setState({
        bootstrapOtpVerifying: false,
        bootstrapOtpError:
          typeof data?.message === "string" ? data.message : "Could not verify initial one-time password.",
      })
    } catch {
      setState({
        bootstrapOtpVerifying: false,
        bootstrapOtpError: "Connection error while verifying initial one-time password.",
      })
    }
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #0a0a0a;
          color: #e5e5e5;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          justify-content: safe center;
          padding: 2rem;
          overflow-y: auto;
        }
        #root {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .logo {
          width: 80px;
          height: 100px;
          margin: 0 auto 2rem;
          display: block;
        }
        .card {
          width: min(100%, 420px);
          min-width: 360px;
          max-width: 420px;
          padding: 2rem;
          background: #141414;
          border: 1px solid #262626;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -2px rgba(0,0,0,0.3);
        }
        form { display: flex; flex-direction: column; gap: 1.25rem; }
        .field { display: flex; flex-direction: column; gap: 0.5rem; }
        .label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .verified-pill {
          font-size: 0.65rem;
          color: #10b981;
          border: 1px solid rgba(16,185,129,0.4);
          border-radius: 999px;
          padding: 0.125rem 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #a3a3a3;
          letter-spacing: 0.01em;
        }
        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        input[type="text"], input[type="password"] {
          width: 100%;
          height: 36px;
          padding: 0 12px;
          border: 1px solid #333;
          border-radius: 8px;
          background: #1a1a1a;
          color: #e5e5e5;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        input:focus {
          outline: none;
          border-color: #525252;
          box-shadow: 0 0 0 3px rgba(82,82,82,0.3), 0 0 0 1px #525252;
        }
        input.invalid {
          background: rgba(239,68,68,0.1);
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220,38,38,0.3), 0 0 0 1px #dc2626;
        }
        input.invalid:focus {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220,38,38,0.3), 0 0 0 1px #dc2626;
        }
        input::placeholder { color: #525252; }
        input:disabled {
          background: #0a0a0a;
          color: #525252;
          cursor: not-allowed;
          opacity: 0.5;
        }
        .password-toggle {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          color: #737373;
          transition: background-color 0.15s, color 0.15s;
        }
        .password-toggle:hover { background: #262626; }
        .password-toggle.active { color: #0ea5e9; }
        .password-toggle svg { width: 16px; height: 16px; }
        .password-input { padding-right: 36px; }
        .checkbox-wrapper {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: -0.25rem;
        }
        input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #0ea5e9;
          cursor: pointer;
        }
        .checkbox-label {
          font-size: 0.875rem;
          color: #a3a3a3;
          cursor: pointer;
          user-select: none;
        }
        .error {
          color: #fca5a5;
          font-size: 0.75rem;
          padding: 0.75rem;
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          display: none;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .error.visible { display: block; }
        .passkey-error-banner {
          color: #fecaca;
          font-size: 0.75rem;
          line-height: 1.45;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
          background: rgba(185, 28, 28, 0.2);
          border: 1px solid rgba(248, 113, 113, 0.45);
          border-radius: 8px;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        button {
          height: 40px;
          border: none;
          border-radius: 8px;
          background: #e5e5e5;
          color: #0a0a0a;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s;
          margin-top: 0.25rem;
        }
        button:hover { background: #d4d4d4; }
        button:disabled {
          background: #404040;
          color: #737373;
          cursor: not-allowed;
        }
        .passkey-button {
          margin-top: 0;
          height: 48px;
          font-size: 0.95rem;
          font-weight: 700;
          background: transparent;
          border: 1px solid #3f3f46;
          border-radius: 10px;
          color: #e5e5e5;
        }
        .passkey-button:hover { background: #1f1f24; }
        div.divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #737373;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        div.divider::before,
        div.divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #2a2a2a;
        }
        hr.divider {
          margin: 1.25rem 0;
          border: 0;
          height: 1px;
          background: rgba(163,163,163,0.2);
        }
        .bootstrap-panel {
          border: 1px solid rgba(56, 189, 248, 0.42);
          border-radius: 12px;
          padding: 1rem 1rem 0.9rem;
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.18) 0%, rgba(37, 99, 235, 0.08) 100%);
          box-shadow: inset 0 0 0 1px rgba(186, 230, 253, 0.08);
        }
        .bootstrap-title {
          font-size: 0.98rem;
          font-weight: 700;
          color: #dbeafe;
          margin-bottom: 0.45rem;
          letter-spacing: 0.01em;
        }
        .bootstrap-text {
          color: #dbeafe;
          font-size: 0.76rem;
          line-height: 1.56;
          margin-bottom: 0.8rem;
          opacity: 0.95;
        }
        .bootstrap-step {
          border-top: 1px solid rgba(148, 163, 184, 0.34);
          padding-top: 0.8rem;
          margin-top: 0.8rem;
        }
        .bootstrap-step:first-of-type {
          border-top: none;
          padding-top: 0;
          margin-top: 0;
        }
        .bootstrap-step-title {
          font-size: 0.8rem;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 0.55rem;
        }
        .bootstrap-hint {
          color: #bfdbfe;
          font-size: 0.72rem;
          line-height: 1.48;
          margin-top: -0.45rem;
          opacity: 0.95;
        }
        .bootstrap-hint code {
          background: rgba(2, 132, 199, 0.2);
          color: #bae6fd;
          border-radius: 4px;
          padding: 0 0.35rem;
        }
        .http-warning {
          background: rgba(234, 179, 8, 0.15);
          border: 1px solid rgba(234, 179, 8, 0.4);
          border-radius: 8px;
          padding: 0.75rem;
          margin-bottom: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .http-warning-text {
          color: #fbbf24;
          font-size: 0.75rem;
          line-height: 1.4;
        }
        .http-warning-dismiss {
          background: transparent;
          border: 1px solid rgba(234, 179, 8, 0.4);
          color: #fbbf24;
          font-size: 0.75rem;
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          align-self: flex-start;
          height: auto;
          margin-top: 0;
        }
        .http-warning-dismiss:hover {
          background: rgba(234, 179, 8, 0.1);
        }
        .loopback-redirect-banner {
          background: rgba(14, 165, 233, 0.15);
          border: 1px solid rgba(14, 165, 233, 0.4);
          border-radius: 8px;
          padding: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .loopback-redirect-text {
          color: #7dd3fc;
          font-size: 0.75rem;
          line-height: 1.4;
        }
        .loopback-redirect-text code {
          background: rgba(2, 132, 199, 0.2);
          color: #bae6fd;
          border-radius: 4px;
          padding: 0 0.35rem;
        }
        .blocked-message {
          color: #fca5a5;
          font-size: 0.875rem;
          padding: 1rem;
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          margin-bottom: 1.25rem;
          text-align: center;
          line-height: 1.5;
        }
        @media (max-width: 420px) {
          .card { min-width: 0; }
        }
        @media (max-width: 480px) {
          .card { padding: 1.2rem; border-radius: 8px; }
          .logo { width: 60px; height: 75px; margin-bottom: 1.5rem; }
        }
        @media (max-height: 760px) {
          body {
            justify-content: flex-start;
            padding-top: 1.25rem;
            padding-bottom: 1.25rem;
          }
        }
      `}</style>
      <svg class="logo" viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M60 80H20V40H60V80Z" fill="#525252" />
        <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="#e5e5e5" />
      </svg>

      <div class="card">
        <Show when={state.loopbackRedirected}>
          <div class="loopback-redirect-banner">
            <div class="loopback-redirect-text">
              You were redirected from <code>{state.loopbackRedirectFrom}</code> to <code>localhost</code> because
              passkeys (WebAuthn) do not work on loopback IP hosts.
            </div>
          </div>
        </Show>

        <Show when={shouldBlock}>
          <div class="blocked-message">
            <strong>HTTPS is required to log in.</strong>
            <br />
            Please access this page over a secure connection.
          </div>
        </Show>

        <Show when={shouldWarn && !state.warningDismissed}>
          <div class="http-warning">
            <div class="http-warning-text">
              ⚠️ You are connecting over HTTP. Your credentials may be visible to attackers on this network.
            </div>
            <button type="button" class="http-warning-dismiss" onClick={dismissWarning}>
              I understand the risks
            </button>
          </div>
        </Show>

        <Show when={bootstrapActive}>
          <div class="bootstrap-panel">
            <div class="bootstrap-title">Initial One-Time Password Setup</div>
            <div class="bootstrap-text">
              For first-time containers with no configured users, enter the Initial One-Time Password (IOTP) from
              container logs. After verification, continue to passkey setup where you can enroll a passkey or choose
              username/password registration.
            </div>

            <form onSubmit={handleBootstrapVerify} class="bootstrap-step">
              <div class="bootstrap-step-title">Step 1: Verify Initial One-Time Password</div>
              <div class="field">
                <div class="label-row">
                  <label for="bootstrapOtp">Initial One-Time Password</label>
                  <Show when={state.bootstrapOtpVerified}>
                    <span class="verified-pill">Verified</span>
                  </Show>
                </div>
                <div class="input-wrapper">
                  <input
                    id="bootstrapOtp"
                    type="text"
                    disabled={shouldBlock || state.bootstrapOtpVerified}
                    value={state.bootstrapOtp}
                    onInput={(event) => {
                      const value = event.currentTarget.value
                      setState({
                        bootstrapOtp: value,
                        bootstrapOtpError: "",
                      })
                    }}
                  />
                </div>
                <div class="bootstrap-hint">
                  Run <code>docker logs &lt;container&gt;</code> and copy the <code>IOTP value</code> shown at startup,
                  or run <code>occ status</code> (or <code>opencode-cloud status</code>) on the host and copy{" "}
                  <code>IOTP value</code>.
                </div>
              </div>
              <Show when={!state.bootstrapOtpVerified && !shouldBlock}>
                <button type="submit" disabled={state.bootstrapOtpVerifying}>
                  {state.bootstrapOtpVerifying ? "Verifying..." : "Continue to passkey setup"}
                </button>
              </Show>
            </form>

            <Show when={Boolean(state.bootstrapOtpError)}>
              <div class="error visible">{state.bootstrapOtpError}</div>
            </Show>
          </div>
        </Show>

        <Show when={bootstrapActive}>
          <hr class="divider" />
        </Show>

        <form onSubmit={handleSubmit}>
          <div class="error" classList={{ visible: Boolean(state.error) }}>
            {state.error}
          </div>

          <Show when={Boolean(state.passkeyBanner)}>
            <div class="passkey-error-banner" role="alert" aria-live="assertive">
              {state.passkeyBanner}
            </div>
          </Show>

          <Show when={state.passkeySupported && !shouldBlock}>
            <button
              type="button"
              class="passkey-button"
              disabled={state.submitting || state.passkeySubmitting}
              onClick={handlePasskeyLogin}
            >
              {state.passkeyLabel}
            </button>
            <div class="divider">or</div>
          </Show>

          <div class="field">
            <label for="username">Username</label>
            <div class="input-wrapper">
              <input
                id="username"
                type="text"
                name="username"
                required
                autofocus
                autocomplete="username webauthn"
                disabled={shouldBlock}
                value={state.username}
                classList={{ invalid: state.invalidUsername }}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  setState({
                    username: value,
                    invalidUsername: false,
                  })
                }}
              />
            </div>
          </div>

          <div class="field">
            <label for="password">Password</label>
            <div class="input-wrapper">
              <input
                id="password"
                type={state.showPassword ? "text" : "password"}
                name="password"
                required
                autocomplete="current-password"
                disabled={shouldBlock}
                value={state.password}
                class="password-input"
                classList={{ invalid: state.invalidPassword }}
                onInput={(event) => {
                  const value = event.currentTarget.value
                  setState({
                    password: value,
                    invalidPassword: false,
                  })
                }}
              />
              <button
                type="button"
                class="password-toggle"
                classList={{ active: state.showPassword }}
                aria-label={state.showPassword ? "Hide password" : "Show password"}
                aria-pressed={state.showPassword}
                disabled={shouldBlock}
                onClick={() => setState("showPassword", !state.showPassword)}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M10 4.58325C5.83333 4.58325 2.5 9.99992 2.5 9.99992C2.5 9.99992 5.83333 15.4166 10 15.4166C14.1667 15.4166 17.5 9.99992 17.5 9.99992C17.5 9.99992 14.1667 4.58325 10 4.58325Z" />
                  <circle cx="10" cy="10" r="2.5" />
                </svg>
              </button>
            </div>
          </div>

          <div class="checkbox-wrapper">
            <input
              id="rememberMe"
              type="checkbox"
              name="rememberMe"
              checked={state.rememberMe}
              disabled={shouldBlock}
              onChange={(event) => setState("rememberMe", event.currentTarget.checked)}
            />
            <label for="rememberMe" class="checkbox-label">
              Remember me
            </label>
          </div>

          <Show when={!shouldBlock}>
            <button type="submit" disabled={state.submitting || state.passkeySubmitting}>
              {state.submitLabel}
            </button>
          </Show>
        </form>
      </div>
    </>
  )
}
