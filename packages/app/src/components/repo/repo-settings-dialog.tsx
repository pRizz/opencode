import { RepoSettingsDialog as ForkRepoSettingsDialog } from "@opencode-ai/fork-ui"
import type { Repo } from "@opencode-ai/sdk/v2/client"
import { useGlobalSDK } from "@/context/global-sdk"

interface RepoSettingsDialogProps {
  repo: Repo
}

export function RepoSettingsDialog(props: RepoSettingsDialogProps) {
  const globalSDK = useGlobalSDK()
  return <ForkRepoSettingsDialog client={globalSDK.client} repo={props.repo} />
}
