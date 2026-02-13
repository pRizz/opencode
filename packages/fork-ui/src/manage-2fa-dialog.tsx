import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ManageTotpPanel } from "./manage-totp-panel"

interface ManageTotpDialogProps {
  onUpdate?: () => void
  getServerUrl: () => string | undefined
}

/**
 * Dialog for managing TOTP when already enabled.
 */
export function ManageTotpDialog(props: ManageTotpDialogProps) {
  const dialog = useDialog()

  return (
    <Dialog title="Manage TOTP" description="Review or reset your authenticator app settings.">
      <ManageTotpPanel onUpdate={props.onUpdate} onClose={() => dialog.close()} getServerUrl={props.getServerUrl} />
    </Dialog>
  )
}

/** @deprecated Prefer ManageTotpDialog. */
export const ManageTwoFactorDialog = ManageTotpDialog
