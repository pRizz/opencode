import { Show } from "solid-js"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { ManageTwoFactorPanel } from "./manage-2fa-panel"
import { useSettingsAuth } from "./settings-auth-state"
import { TwoFactorSetupFlow } from "./two-factor-setup-flow"

export function SettingsAuthTwoFactorTab() {
  const auth = useSettingsAuth()

  const manageDisabled = () => !auth.state.twoFactorConfigured
  const manageDisabledReason = () => "Set up TOTP first to unlock manage actions."

  return (
    <div
      class="flex h-full flex-col overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10"
      data-action="settings-auth-totp-content"
    >
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8">
          <h2 class="text-16-medium text-text-strong">TOTP</h2>
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <div class="rounded-lg bg-surface-raised-base p-4" data-action="settings-auth-totp-setup-card">
          <Show
            when={auth.state.twoFactorEnabled}
            fallback={<div class="text-13-regular text-text-weak">TOTP is disabled on this server.</div>}
          >
            <TwoFactorSetupFlow
              embedded
              getServerUrl={auth.getServerUrl}
              onConfigured={() => void auth.refreshDeviceTrust()}
            />
          </Show>
        </div>

        <Tooltip placement="top" value={manageDisabledReason()} inactive={!manageDisabled()}>
          <div
            class="rounded-lg bg-surface-raised-base p-4"
            classList={{
              "opacity-60": manageDisabled(),
            }}
            data-action="settings-auth-totp-manage-card"
          >
            <Show
              when={!manageDisabled()}
              fallback={
                <div class="text-13-regular text-text-weak" data-action="settings-auth-totp-manage-disabled-reason">
                  {manageDisabledReason()}
                </div>
              }
            >
              <ManageTwoFactorPanel
                compact
                getServerUrl={auth.getServerUrl}
                onUpdate={() => void auth.refreshDeviceTrust()}
              />
            </Show>
          </div>
        </Tooltip>
      </div>
    </div>
  )
}
