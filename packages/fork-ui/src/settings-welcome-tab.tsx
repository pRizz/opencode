import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { WelcomeDialog } from "./welcome-dialog"
import { markWelcomeSeen } from "./welcome-state"

export function SettingsWelcomeTab() {
  const dialog = useDialog()

  const show = () => {
    markWelcomeSeen()
    dialog.show(() => <WelcomeDialog />)
  }

  return (
    <div class="flex flex-col gap-4 px-2 pb-3" data-action="settings-welcome-tab">
      <div class="flex flex-col gap-1">
        <div class="text-20-medium text-text-strong">Welcome</div>
        <div class="text-12-regular text-text-weak">
          Reopen the first-run welcome modal any time. It includes quick start guidance, fork feature highlights, and
          project links.
        </div>
      </div>

      <div class="rounded-md border border-border-weak-base p-3 flex items-center justify-between gap-3">
        <div class="flex flex-col gap-1">
          <div class="text-13-medium text-text-strong">Replay welcome modal</div>
          <div class="text-12-regular text-text-weak">Show the same modal displayed on first visit to the home page.</div>
        </div>
        <Button size="normal" onClick={show} data-action="settings-welcome-show-modal">
          Show welcome modal
        </Button>
      </div>
    </div>
  )
}
