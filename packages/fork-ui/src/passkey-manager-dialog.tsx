import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { PasskeyManagerPanel } from "./passkey-manager-panel"

interface PasskeyManagerDialogProps {
  onUpdate?: () => void
  getServerUrl: () => string | undefined
}
export function PasskeyManagerDialog(props: PasskeyManagerDialogProps) {
  const dialog = useDialog()
  return (
    <Dialog title="Manage passkeys" description="Add and remove WebAuthn passkeys for this account.">
      <PasskeyManagerPanel onUpdate={props.onUpdate} onClose={() => dialog.close()} getServerUrl={props.getServerUrl} />
    </Dialog>
  )
}
