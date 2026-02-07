import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ManageTwoFactorPanel } from "./manage-2fa-panel"

interface ManageTwoFactorDialogProps {
  onUpdate?: () => void
  getServerUrl: () => string | undefined
}

/**
 * Dialog for managing 2FA when already enabled.
 */
export function ManageTwoFactorDialog(props: ManageTwoFactorDialogProps) {
  const dialog = useDialog()

  return (
    <Dialog title="Manage 2FA" description="Review or reset your two-factor authentication settings.">
      <ManageTwoFactorPanel
        onUpdate={props.onUpdate}
        onClose={() => dialog.close()}
        getServerUrl={props.getServerUrl}
      />
    </Dialog>
  )
}
