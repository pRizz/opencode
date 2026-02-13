import { Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"

interface ManageTotpPanelProps {
  onUpdate?: () => void
  onClose?: () => void
  getServerUrl: () => string | undefined
  compact?: boolean
}

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/opencode_csrf=([^;]+)/)
  return match ? match[1] : undefined
}

export function ManageTotpPanel(props: ManageTotpPanelProps) {
  const [confirmAction, setConfirmAction] = createSignal<"reset" | "disable" | null>(null)
  const [working, setWorking] = createSignal(false)

  const doAction = async (
    path: "/auth/totp/reset" | "/auth/totp/disable",
    errorTitle: string,
    successTitle: string,
  ) => {
    if (working()) return false
    const url = props.getServerUrl()
    if (!url) return false

    setWorking(true)

    const token = getCsrfToken()
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        ...(token ? { "X-CSRF-Token": token } : {}),
      },
    }).catch(() => undefined)

    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) as { message?: string }
      showToast({ title: errorTitle, description: body.message ?? "Please try again." })
      setWorking(false)
      return false
    }

    showToast({ title: successTitle })
    props.onUpdate?.()
    props.onClose?.()
    setWorking(false)
    return true
  }

  const handleReset = async () => {
    await doAction("/auth/totp/reset", "Failed to reset TOTP", "TOTP reset")
  }

  const handleDisable = async () => {
    await doAction("/auth/totp/disable", "Failed to disable TOTP", "TOTP disabled")
  }

  return (
    <div class="flex flex-col gap-4 px-2 pb-3" data-action="settings-auth-totp-manage-panel">
      <div class="flex flex-col gap-2 rounded-md border border-border-weak-base p-3 text-14-regular text-text-weak">
        <div class="text-text-strong text-14-medium">TOTP authentication is enabled.</div>
        <div>Resetting TOTP removes your current authenticator setup.</div>
        <div>Disabling TOTP stops future setup prompts.</div>
      </div>

      <Show
        when={confirmAction() !== null}
        fallback={
          <div class="flex justify-end gap-2 pt-2">
            <Show when={!props.compact}>
              <Button size="large" variant="ghost" onClick={() => props.onClose?.()}>
                Close
              </Button>
            </Show>
            <Button
              size="large"
              variant="ghost"
              onClick={() => setConfirmAction("disable")}
              data-action="settings-auth-totp-manage-disable"
            >
              Disable TOTP
            </Button>
            <Button
              size="large"
              variant="secondary"
              onClick={() => setConfirmAction("reset")}
              data-action="settings-auth-totp-manage-reset"
            >
              Reset TOTP
            </Button>
          </div>
        }
      >
        <div class="flex flex-col gap-2 rounded-md border border-border-weak-base p-3 text-14-regular">
          <div class="text-text-strong text-14-medium">
            {confirmAction() === "disable" ? "Confirm disable" : "Confirm reset"}
          </div>
          <div class="text-text-weak">
            {confirmAction() === "disable"
              ? "You will not be prompted to set up TOTP again unless you re-enable it."
              : "This will disable TOTP until you set it up again."}
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <Button size="large" variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              size="large"
              variant="secondary"
              onClick={confirmAction() === "disable" ? handleDisable : handleReset}
              disabled={working()}
            >
              {working()
                ? confirmAction() === "disable"
                  ? "Disabling..."
                  : "Resetting..."
                : confirmAction() === "disable"
                  ? "Confirm disable"
                  : "Confirm reset"}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  )
}

/** @deprecated Prefer ManageTotpPanel. */
export const ManageTwoFactorPanel = ManageTotpPanel
