import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { OpencodeClient, Repo } from "@opencode-ai/sdk/v2/client"
import { type CloneProgressPlatform, type CloneProgressServer } from "./use-clone-progress"
import { CloneDialog } from "./repo/clone-dialog"
import { RepositoryManagerDialog } from "./repo/repository-manager-dialog"
import { SshKeysDialog } from "./ssh-keys-dialog"

interface SettingsRepositoriesTabProps {
  client: Pick<OpencodeClient, "repo" | "config" | "sshKeys">
  server: CloneProgressServer
  platform: CloneProgressPlatform
  homePath?: string
  onOpenRepo?: (repo: Repo) => void
  onSelectDirectory?: (input: { title: string; multiple: boolean }) => Promise<string | string[] | null>
  onOpenRepositoriesSettings?: () => void
}

export function SettingsRepositoriesTab(props: SettingsRepositoriesTabProps) {
  const dialog = useDialog()

  const openCloneDialog = () => {
    dialog.show(() => (
      <CloneDialog
        client={props.client}
        server={props.server}
        platform={props.platform}
        homePath={props.homePath}
        onOpenRepositoriesSettings={props.onOpenRepositoriesSettings ?? (() => dialog.close())}
        onCloneSuccess={(repo) => {
          props.onOpenRepo?.(repo)
        }}
      />
    ))
  }

  const openRepositoryManager = () => {
    dialog.show(() => (
      <RepositoryManagerDialog
        client={props.client}
        server={props.server}
        platform={props.platform}
        homePath={props.homePath}
        onOpenRepo={props.onOpenRepo}
        onOpenRepositoriesSettings={props.onOpenRepositoriesSettings}
        onSelectDirectory={props.onSelectDirectory}
      />
    ))
  }

  return (
    <div class="flex flex-col gap-4 px-2 pb-3" data-action="settings-repositories-tab">
      <div class="flex flex-col gap-1">
        <div class="text-20-medium text-text-strong">Repositories</div>
        <div class="text-12-regular text-text-weak">
          Manage repository access for this workspace. HTTPS clone URLs are unsupported; use SSH keys.
        </div>
      </div>

      <div class="rounded-md border border-border-weak-base p-3 flex items-center justify-between gap-3">
        <div class="flex flex-col gap-1">
          <div class="text-13-medium text-text-strong">Repository actions</div>
          <div class="text-12-regular text-text-weak">Clone with SSH or manage the repository list.</div>
        </div>
        <div class="flex items-center gap-2">
          <Button size="normal" variant="ghost" onClick={openCloneDialog} data-action="settings-repositories-open-clone">
            <Icon name="download" size="small" />
            Clone from URL
          </Button>
          <Button size="normal" onClick={openRepositoryManager} data-action="settings-repositories-open-manager">
            <Icon name="folder" size="small" />
            Manage repos
          </Button>
        </div>
      </div>

      <SshKeysDialog client={props.client} />
    </div>
  )
}
