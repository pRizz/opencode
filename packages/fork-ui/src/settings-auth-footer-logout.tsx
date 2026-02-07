import { Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { authLogout } from "./settings-auth-actions"
import { useSettingsAuth } from "./settings-auth-state"

export function SettingsAuthFooterLogout() {
  const auth = useSettingsAuth()
  const [busy, setBusy] = createSignal(false)

  const handleLogout = async () => {
    if (busy()) return
    setBusy(true)
    const ok = await authLogout({ getServerUrl: auth.getServerUrl })
    if (!ok) {
      showToast({
        title: "Unable to log out",
        description: "Please try again.",
      })
    }
    setBusy(false)
  }

  return (
    <Show when={auth.state.authenticated}>
      <Button
        size="small"
        variant="ghost"
        class="justify-start"
        disabled={busy()}
        onClick={() => void handleLogout()}
        data-action="settings-auth-footer-logout"
      >
        {busy() ? "Logging out..." : "Logout"}
      </Button>
    </Show>
  )
}
