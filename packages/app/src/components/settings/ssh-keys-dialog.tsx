import { SshKeysDialog as ForkSshKeysDialog } from "@opencode-ai/fork-ui"
import { useGlobalSDK } from "@/context/global-sdk"

export function SshKeysDialog() {
  const globalSDK = useGlobalSDK()
  return <ForkSshKeysDialog client={globalSDK.client} />
}
