import { Show, createSignal } from "solid-js"

type BootstrapSignupBootstrap = {
  passkeySetupUrl?: string
}

declare global {
  interface Window {
    __OPENCODE_BOOTSTRAP_SIGNUP__?: BootstrapSignupBootstrap
  }
}

function getCsrfToken(): string {
  const match = document.cookie.match(/opencode_csrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ""
}

export function BootstrapSignupApp() {
  const bootstrap = window.__OPENCODE_BOOTSTRAP_SIGNUP__ ?? {}
  const passkeySetupUrl = bootstrap.passkeySetupUrl || "/auth/passkey/setup?required=1"

  const [username, setUsername] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [confirmPassword, setConfirmPassword] = createSignal("")
  const [showPassword, setShowPassword] = createSignal(false)
  const [showConfirmPassword, setShowConfirmPassword] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal("")
  const [status, setStatus] = createSignal("")

  const handleSubmit = async (event: Event) => {
    event.preventDefault()
    if (submitting()) return

    const nextUsername = username().trim()
    const nextPassword = password()
    const nextConfirm = confirmPassword()

    if (!nextUsername || !nextPassword || !nextConfirm) {
      setError("Username and password are required.")
      return
    }
    if (nextPassword !== nextConfirm) {
      setError("Passwords do not match.")
      return
    }

    setSubmitting(true)
    setError("")
    setStatus("")

    try {
      const csrfToken = getCsrfToken()
      const res = await fetch("/auth/bootstrap/signup", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({
          username: nextUsername,
          password: nextPassword,
        }),
      })

      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        redirectTo?: string
      }

      if (!res.ok || !body.success) {
        setError(body.message ?? "Could not create user.")
        return
      }

      setStatus("Account created. Redirecting...")
      window.location.href = body.redirectTo || "/"
    } catch {
      setError("Connection error while creating user.")
    } finally {
      setSubmitting(false)
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
        form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        label {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.78rem;
          color: #c4c4c4;
        }
        input[type="text"], input[type="password"] {
          width: 100%;
          height: 40px;
          border-radius: 8px;
          border: 1px solid #2d2d2d;
          background: #101010;
          color: #f4f4f5;
          padding: 0 0.75rem;
          font-size: 0.9rem;
        }
        input:focus {
          outline: none;
          border-color: #525252;
          box-shadow: 0 0 0 2px rgba(82,82,82,0.3);
        }
        .row {
          position: relative;
        }
        .toggle {
          position: absolute;
          right: 0.45rem;
          top: 1.5rem;
          background: transparent;
          color: #9ca3af;
          border: none;
          padding: 0.2rem 0.35rem;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .hint {
          font-size: 0.75rem;
          color: #9ca3af;
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
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          border-top: 1px solid #2a2a2a;
          padding-top: 0.75rem;
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
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
      <div class="card">
        <h1>Create username/password account</h1>
        <div class="subtitle">
          Skip passkey enrollment for now and create your first managed account with a username and password.
        </div>
        <div class="hint">Password must be at least 12 characters and include 3 of 4 character classes.</div>

        <Show when={Boolean(error())}>
          <div class="error">{error()}</div>
        </Show>
        <Show when={Boolean(status())}>
          <div class="success">{status()}</div>
        </Show>

        <form onSubmit={handleSubmit}>
          <div>
            <label for="username">Username</label>
            <input
              id="username"
              type="text"
              autocomplete="username"
              value={username()}
              disabled={submitting()}
              onInput={(event) => {
                setUsername(event.currentTarget.value)
                setError("")
              }}
            />
          </div>
          <div class="row">
            <label for="password">Password</label>
            <input
              id="password"
              type={showPassword() ? "text" : "password"}
              autocomplete="new-password"
              value={password()}
              disabled={submitting()}
              onInput={(event) => {
                setPassword(event.currentTarget.value)
                setError("")
              }}
            />
            <button class="toggle" type="button" onClick={() => setShowPassword(!showPassword())}>
              {showPassword() ? "Hide" : "Show"}
            </button>
          </div>
          <div class="row">
            <label for="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type={showConfirmPassword() ? "text" : "password"}
              autocomplete="new-password"
              value={confirmPassword()}
              disabled={submitting()}
              onInput={(event) => {
                setConfirmPassword(event.currentTarget.value)
                setError("")
              }}
            />
            <button class="toggle" type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword())}>
              {showConfirmPassword() ? "Hide" : "Show"}
            </button>
          </div>

          <div class="actions">
            <button class="secondary" type="button" disabled={submitting()} onClick={() => (window.location.href = passkeySetupUrl)}>
              Back to passkey setup
            </button>
            <button type="submit" disabled={submitting()}>
              {submitting() ? "Creating..." : "Create account"}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
