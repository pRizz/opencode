import { Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { showToast } from "@opencode-ai/ui/toast"
import { authForgetDevice, authLogoutAll } from "./settings-auth-actions"
import { useSettingsAuth } from "./settings-auth-state"

export function SettingsAuthSessionTab() {
  const auth = useSettingsAuth()
  const [busy, setBusy] = createSignal<"logout-all" | "forget-device" | null>(null)

  const handleLogoutAll = async () => {
    if (busy()) return
    setBusy("logout-all")
    const ok = await authLogoutAll({ getServerUrl: auth.getServerUrl })
    if (!ok) {
      showToast({
        title: "Unable to log out all sessions",
        description: "Please try again.",
      })
    }
    setBusy(null)
  }

  const handleForgetDevice = async () => {
    if (busy() || !auth.state.deviceTrusted) return
    setBusy("forget-device")
    const ok = await authForgetDevice({ getServerUrl: auth.getServerUrl })
    if (!ok) {
      showToast({
        title: "Unable to forget this device",
        description: "Please try again.",
      })
      setBusy(null)
      return
    }

    await auth.refreshDeviceTrust()
    showToast({ title: "Device trust removed" })
    setBusy(null)
  }

  return (
    <div class="flex h-full flex-col overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10" data-action="settings-auth-session-content">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8">
          <h2 class="text-16-medium text-text-strong">Session</h2>
        </div>
      </div>

      <div class="flex flex-col gap-6 w-full">
        <div class="rounded-lg bg-surface-raised-base p-4">
          <div class="text-14-medium text-text-strong">Account</div>
          <Show
            when={auth.state.authenticated}
            fallback={<div class="mt-1 text-13-regular text-text-weak">Sign in to manage session controls.</div>}
          >
            <div class="mt-1 text-13-regular text-text-weak">Signed in as {auth.state.username ?? "unknown user"}.</div>
          </Show>
        </div>

        <div class="rounded-lg bg-surface-raised-base p-4">
          <div class="text-14-medium text-text-strong">Session actions</div>
          <div class="mt-3 flex flex-wrap gap-2">
            <Tooltip
              placement="top"
              value="This device is not currently trusted."
              inactive={auth.state.deviceTrusted}
            >
              <Button
                size="small"
                variant="ghost"
                disabled={!auth.state.deviceTrusted || Boolean(busy())}
                onClick={() => void handleForgetDevice()}
                data-action="settings-auth-session-forget-device"
              >
                {busy() === "forget-device" ? "Forgetting..." : "Forget this device"}
              </Button>
            </Tooltip>
            <Button
              size="small"
              variant="secondary"
              disabled={Boolean(busy())}
              onClick={() => void handleLogoutAll()}
              data-action="settings-auth-session-logout-all"
            >
              {busy() === "logout-all" ? "Logging out..." : "Log out all sessions"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
