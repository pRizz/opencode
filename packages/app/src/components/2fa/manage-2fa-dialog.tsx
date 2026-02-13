import { ManageTotpDialog as ForkManageTotpDialog } from "@opencode-ai/fork-ui"
import { useServer } from "@/context/server"

interface ManageTotpDialogProps {
  onUpdate?: () => void
}

export function ManageTotpDialog(props: ManageTotpDialogProps) {
  const server = useServer()
  return <ForkManageTotpDialog onUpdate={props.onUpdate} getServerUrl={() => server.url} />
}

/** @deprecated Prefer ManageTotpDialog. */
export const ManageTwoFactorDialog = ManageTotpDialog
