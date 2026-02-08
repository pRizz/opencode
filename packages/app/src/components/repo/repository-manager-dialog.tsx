import { RepositoryManagerDialog as ForkRepositoryManagerDialog } from "@opencode-ai/fork-ui"
import type { Repo } from "@opencode-ai/sdk/v2/client"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobalSync } from "@/context/global-sync"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { DialogSettings } from "@/components/dialog-settings"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"

interface RepositoryManagerDialogProps {
  onOpenRepo?: (repo: Repo) => void
}

export function RepositoryManagerDialog(props: RepositoryManagerDialogProps) {
  const sync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const server = useServer()
  const platform = usePlatform()
  const dialog = useDialog()

  const selectDirectory = (input: { title: string; multiple: boolean }) => {
    return new Promise<string | string[] | null>((resolve) => {
      dialog.show(
        () => <DialogSelectDirectory title={input.title} multiple={input.multiple} onSelect={resolve} />,
        () => resolve(null),
      )
    })
  }

  return (
    <ForkRepositoryManagerDialog
      client={globalSDK.client}
      server={server}
      platform={platform}
      homePath={sync.data.path.home}
      onOpenRepo={props.onOpenRepo}
      onOpenRepositoriesSettings={() => dialog.show(() => <DialogSettings initialTab="repositories" />)}
      onSelectDirectory={selectDirectory}
    />
  )
}
