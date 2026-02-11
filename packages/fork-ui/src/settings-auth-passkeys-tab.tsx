import { Show } from "solid-js"
import { PasskeyManagerPanel } from "./passkey-manager-panel"
import { useSettingsAuth } from "./settings-auth-state"

export function SettingsAuthPasskeysTab() {
  const auth = useSettingsAuth()

  return (
    <div
      class="flex h-full flex-col overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10"
      data-action="settings-auth-passkeys-content"
    >
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8">
          <h2 class="text-16-medium text-text-strong">Passkeys</h2>
        </div>
      </div>

      <Show when={auth.state.passkeysEnabled} fallback={<PasskeysDisabledState />}>
        <PasskeyManagerPanel compact onUpdate={() => void auth.refresh()} getServerUrl={auth.getServerUrl} />
      </Show>
    </div>
  )
}

function PasskeysDisabledState() {
  return (
    <div class="rounded-lg bg-surface-raised-base p-4 text-13-regular text-text-weak">
      Passkeys are disabled on this server.
    </div>
  )
}
