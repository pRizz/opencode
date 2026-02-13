import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ManageTwoFactorPanel } from "./manage-2fa-panel"

interface ManageTwoFactorDialogProps {
  onUpdate?: () => void
  getServerUrl: () => string | undefined
}

/**
 * Dialog for managing TOTP when already enabled.
 */
export function ManageTwoFactorDialog(props: ManageTwoFactorDialogProps) {
  const dialog = useDialog()

  return (
    <Dialog title="Manage TOTP" description="Review or reset your authenticator app settings.">
      <ManageTwoFactorPanel
        onUpdate={props.onUpdate}
        onClose={() => dialog.close()}
        getServerUrl={props.getServerUrl}
      />
    </Dialog>
  )
}
