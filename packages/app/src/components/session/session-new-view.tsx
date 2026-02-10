import { Show, createMemo } from "solid-js"
import { DateTime } from "luxon"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import type { Repo } from "@opencode-ai/sdk/v2/client"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { CloneDialog } from "@/components/repo/clone-dialog"
import { RepoSelector } from "@/components/repo/repo-selector"
import { RepositoryManagerDialog } from "@/components/repo/repository-manager-dialog"

const MAIN_WORKTREE = "main"
const CREATE_WORKTREE = "create"

interface NewSessionViewProps {
  worktree: string
  onWorktreeChange: (value: string) => void
}

export function NewSessionView(props: NewSessionViewProps) {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  const dialog = useDialog()

  const sandboxes = createMemo(() => sync.project?.sandboxes ?? [])
  const options = createMemo(() => [MAIN_WORKTREE, ...sandboxes(), CREATE_WORKTREE])
  const current = createMemo(() => {
    const selection = props.worktree
    if (options().includes(selection)) return selection
    return MAIN_WORKTREE
  })
  const projectRoot = createMemo(() => sync.project?.worktree ?? sdk.directory)
  const isWorktree = createMemo(() => {
    const project = sync.project
    if (!project) return false
    return sdk.directory !== project.worktree
  })

  const openRepo = (repo: Repo) => {
    layout.projects.open(repo.path)
    navigate(`/${base64Encode(repo.path)}/session`)
  }

  const label = (value: string) => {
    if (value === MAIN_WORKTREE) {
      if (isWorktree()) return language.t("session.new.worktree.main")
      const branch = sync.data.vcs?.branch
      if (branch) return language.t("session.new.worktree.mainWithBranch", { branch })
      return language.t("session.new.worktree.main")
    }

    if (value === CREATE_WORKTREE) return language.t("session.new.worktree.create")

    return getFilename(value)
  }

  return (
    <div class="size-full flex flex-col justify-end items-start gap-4 flex-[1_0_0] self-stretch max-w-200 mx-auto 2xl:max-w-[1000px] px-6 pb-[calc(var(--prompt-height,11.25rem)+64px)]">
      <div class="text-20-medium text-text-weaker">{language.t("command.session.new")}</div>
      <div class="flex justify-center items-center gap-3">
        <Icon name="folder" size="small" />
        <div class="text-12-medium text-text-weak select-text">
          {getDirectory(projectRoot())}
          <span class="text-text-strong">{getFilename(projectRoot())}</span>
        </div>
      </div>
      <div class="flex justify-center items-center gap-1">
        <Icon name="branch" size="small" />
        <div class="text-12-medium text-text-weak select-text ml-2">{label(current())}</div>
      </div>

      <div class="w-full flex flex-wrap items-center gap-2" data-action="new-session-repo-actions">
        <Button
          size="normal"
          variant="ghost"
          onClick={() => dialog.show(() => <CloneDialog onCloneSuccess={openRepo} />)}
          data-action="new-session-repo-clone-cta"
        >
          <Icon name="download" size="small" />
          Clone repo
        </Button>
        <Button
          size="normal"
          variant="ghost"
          onClick={() => dialog.show(() => <RepositoryManagerDialog onOpenRepo={openRepo} />)}
          data-action="new-session-repo-manage-cta"
        >
          <Icon name="folder" size="small" />
          Manage repos
        </Button>
      </div>

      <div class="w-full" data-action="new-session-repo-selector">
        <RepoSelector currentPath={sync.data.path.directory} onOpenRepo={openRepo} />
      </div>

      <Show when={sync.project}>
        {(project) => (
          <div class="flex justify-center items-center gap-3">
            <Icon name="pencil-line" size="small" />
            <div class="text-12-medium text-text-weak">
              {language.t("session.new.lastModified")}&nbsp;
              <span class="text-text-strong">
                {DateTime.fromMillis(project().time.updated ?? project().time.created)
                  .setLocale(language.locale())
                  .toRelative()}
              </span>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
