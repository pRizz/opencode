import { Show, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { SessionIndicator } from "./session-indicator"

interface SessionInfo {
  username?: string
}

interface SettingsAuthenticationSectionProps {
  getServerUrl: () => string | undefined
}

export function SettingsAuthenticationSection(props: SettingsAuthenticationSectionProps) {
  const [state, setState] = createStore({
    checked: false,
    username: undefined as string | undefined,
  })

  const load = async () => {
    const base = props.getServerUrl()
    if (!base) {
      setState("checked", true)
      setState("username", undefined)
      return
    }

    try {
      const res = await fetch(`${base}/auth/session`, {
        credentials: "include",
      })
      if (!res.ok) {
        setState("checked", true)
        setState("username", undefined)
        return
      }

      const body = (await res.json().catch(() => ({}))) as SessionInfo
      setState("username", typeof body.username === "string" ? body.username : undefined)
      setState("checked", true)
    } catch {
      setState("checked", true)
      setState("username", undefined)
    }
  }

  createEffect(() => {
    props.getServerUrl()
    void load()
  })

  return (
    <Show when={state.checked && state.username}>
      <div class="flex flex-col gap-1" data-action="settings-authentication-section">
        <h3 class="text-14-medium text-text-strong pb-2">Authentication</h3>
        <div class="bg-surface-raised-base px-4 rounded-lg">
          <div
            class="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-border-weak-base last:border-none"
            data-action="settings-authentication-account-row"
          >
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-14-medium text-text-strong">Account</span>
              <span class="text-12-regular text-text-weak">
                Manage your active session, two-factor authentication, and passkeys.
              </span>
            </div>
            <div class="flex-shrink-0">
              <SessionIndicator
                session={{
                  isAuthenticated: () => Boolean(state.username),
                  username: () => state.username,
                }}
                getServerUrl={props.getServerUrl}
              />
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
