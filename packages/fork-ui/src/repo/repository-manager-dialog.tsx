import { createResource, createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import type { OpencodeClient, Repo } from "@opencode-ai/sdk/v2/client"
import { type CloneProgressPlatform, type CloneProgressServer } from "../use-clone-progress"
import { CloneDialog } from "./clone-dialog"
import { RepoSettingsDialog } from "./repo-settings-dialog"
import { formatRepoError } from "./repo-errors"

interface RepositoryManagerDialogProps {
  client: Pick<OpencodeClient, "repo" | "config" | "sshKeys">
  server: CloneProgressServer
  platform: CloneProgressPlatform
  homePath?: string
  onOpenRepo?: (repo: Repo) => void
  onOpenRepositoriesSettings?: () => void
  onSelectDirectory?: (input: { title: string; multiple: boolean }) => Promise<string | string[] | null>
}

export function RepositoryManagerDialog(props: RepositoryManagerDialogProps) {
  const dialog = useDialog()
  const [localPath, setLocalPath] = createSignal("")

  const formatCreated = (time: number) => {
    return new Date(time).toLocaleString()
  }

  const [repos, { refetch }] = createResource(async () => {
    try {
      return (await props.client.repo.list()).data ?? []
    } catch {
      return []
    }
  })

  const openDirectoryPicker = async () => {
    if (!props.onSelectDirectory) return null
    return props.onSelectDirectory({ title: "Add local repository", multiple: false })
  }

  const addLocalRepo = async (maybePath?: string) => {
    const path = (maybePath ?? localPath()).trim()
    if (!path) {
      const picked = await openDirectoryPicker()
      const selected = Array.isArray(picked) ? picked[0] : picked
      if (!selected) return
      setLocalPath(selected)
      await addLocalRepo(selected)
      return
    }
    try {
      const repo = await props.client.repo.add({ path }).then((x) => x.data)
      if (repo) {
        setLocalPath("")
        await refetch()
        showToast({ title: "Repository added", description: repo.name })
      }
    } catch (err) {
      showToast({
        title: "Failed to add repository",
        description: formatRepoError(err),
      })
    }
  }

  const handleClone = () => {
    dialog.show(() => (
      <CloneDialog
        client={props.client}
        server={props.server}
        platform={props.platform}
        homePath={props.homePath}
        onOpenRepositoriesSettings={props.onOpenRepositoriesSettings}
        onCloneSuccess={async (repo) => {
          await refetch()
          showToast({ title: "Repository cloned", description: repo.name })
          props.onOpenRepo?.(repo)
        }}
      />
    ))
  }

  const handleSelectDirectory = async () => {
    const picked = await openDirectoryPicker()
    const selected = Array.isArray(picked) ? picked[0] : picked
    if (!selected) return
    setLocalPath(selected)
  }

  const handleSettings = (repo: Repo) => {
    dialog.show(() => <RepoSettingsDialog client={props.client} repo={repo} />)
  }

  return (
    <Dialog
      title="Manage repositories"
      description="Clone repositories or add existing local paths."
      class="max-w-[640px]"
    >
      <div class="flex flex-col gap-4 px-2 pb-3" data-action="repo-manager-dialog">
        <div class="flex flex-col gap-3 rounded-md border border-border-weak-base p-3">
          <TextField
            label="Local repository path"
            placeholder="~/Projects/my-repo"
            value={localPath()}
            onChange={setLocalPath}
          />
          <div class="text-12-regular text-text-weak">Path must exist on the host machine running opencode.</div>
          <Show when={props.onSelectDirectory}>
            <div class="flex justify-end">
              <Button size="normal" variant="ghost" onClick={handleSelectDirectory}>
                <Icon name="folder" size="small" />
                Choose folder
              </Button>
            </div>
          </Show>
          <div class="flex justify-end gap-2">
            <Button size="normal" variant="ghost" onClick={handleClone} data-action="repo-manager-clone">
              <Icon name="download" size="small" />
              Clone from URL
            </Button>
            <Button size="normal" onClick={() => addLocalRepo()}>
              <Icon name="plus-small" size="small" />
              Add local repo
            </Button>
          </div>
        </div>

        <Show when={repos()?.length} fallback={<div class="text-12-regular text-text-weak">No repositories yet.</div>}>
          <div class="flex flex-col gap-2">
            <For each={repos()}>
              {(repo) => (
                <div class="flex items-center justify-between gap-4 rounded-md border border-border-weak-base px-3 py-2">
                  <div class="min-w-0">
                    <div class="text-14-medium text-text-strong">{repo.name}</div>
                    <div class="text-12-regular text-text-weak truncate">{repo.path}</div>
                    <div class="text-12-regular text-text-weak">Added {formatCreated(repo.time.created)}</div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <Button size="normal" variant="ghost" onClick={() => handleSettings(repo)}>
                      <Icon name="settings-gear" size="small" />
                      Settings
                    </Button>
                    <Button size="normal" onClick={() => props.onOpenRepo?.(repo)} disabled={!props.onOpenRepo}>
                      Open
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="flex justify-end gap-2 pt-2">
          <Button size="large" variant="ghost" onClick={() => dialog.close()}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
