import { RepoSelector as ForkRepoSelector } from "@opencode-ai/fork-ui"
import type { Repo } from "@opencode-ai/sdk/v2/client"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobalSync } from "@/context/global-sync"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { DialogSettings } from "@/components/dialog-settings"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"

interface RepoSelectorProps {
  currentPath?: string
  onOpenRepo?: (repo: Repo) => void
  onBranchChange?: (repo: Repo, branch: string) => void
}

export function RepoSelector(props: RepoSelectorProps) {
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
    <ForkRepoSelector
      client={globalSDK.client}
      server={server}
      platform={platform}
      homePath={sync.data.path.home}
      currentPath={props.currentPath}
      onOpenRepo={props.onOpenRepo}
      onBranchChange={props.onBranchChange}
      onOpenRepositoriesSettings={() => dialog.show(() => <DialogSettings initialTab="repositories" />)}
      onSelectDirectory={selectDirectory}
    />
  )
}
