import { CloneDialog as ForkCloneDialog } from "@opencode-ai/fork-ui"
import type { Repo } from "@opencode-ai/sdk/v2/client"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobalSync } from "@/context/global-sync"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { DialogSettings } from "@/components/dialog-settings"

interface CloneDialogProps {
  onCloneSuccess?: (repo: Repo) => void
}

export function CloneDialog(props: CloneDialogProps) {
  const sync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const server = useServer()
  const platform = usePlatform()
  const dialog = useDialog()

  return (
    <ForkCloneDialog
      client={globalSDK.client}
      server={server}
      platform={platform}
      homePath={sync.data.path.home}
      onCloneSuccess={props.onCloneSuccess}
      onOpenRepositoriesSettings={() => dialog.show(() => <DialogSettings initialTab="repositories" />)}
    />
  )
}
