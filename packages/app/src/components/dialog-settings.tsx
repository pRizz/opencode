import { Component } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import {
  SettingsAuthFooterLogout,
  SettingsAuthPasskeysTab,
  SettingsAuthProvider,
  SettingsAuthSessionTab,
  SettingsAuthTwoFactorTab,
  SettingsRepositoriesTab,
  SettingsWelcomeTab,
  useSettingsAuth,
} from "@/fork/ui"
import type { Repo } from "@opencode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLayout } from "@/context/layout"
import { DialogSelectDirectory } from "./dialog-select-directory"
import { SettingsGeneral } from "./settings-general"
import { SettingsKeybinds } from "./settings-keybinds"
import { SettingsProviders } from "./settings-providers"
import { SettingsModels } from "./settings-models"

type DialogSettingsTab =
  | "general"
  | "welcome"
  | "shortcuts"
  | "providers"
  | "models"
  | "repositories"
  | "auth-session"
  | "auth-passkeys"
  | "auth-2fa"

interface DialogSettingsProps {
  initialTab?: DialogSettingsTab
}

const SettingsAuthenticationTabs: Component = () => {
  const auth = useSettingsAuth()
  const disabled = () => !auth.state.checked || !auth.state.authenticated

  return (
    <div class="flex flex-col gap-1.5" data-action="settings-auth-nav-section">
      <Tabs.SectionTitle>Authentication</Tabs.SectionTitle>
      <div class="flex flex-col gap-1.5 w-full">
        <Tabs.Trigger value="auth-session" data-action="settings-auth-tab-session" disabled={disabled()}>
          <Icon name="lock" />
          Session
        </Tabs.Trigger>
        <Tabs.Trigger value="auth-passkeys" data-action="settings-auth-tab-passkeys" disabled={disabled()}>
          <Icon name="checklist" />
          Passkeys
        </Tabs.Trigger>
        <Tabs.Trigger value="auth-2fa" data-action="settings-auth-tab-2fa" disabled={disabled()}>
          <Icon name="lock-open" />
          2FA
        </Tabs.Trigger>
      </div>
    </div>
  )
}

export const DialogSettings: Component<DialogSettingsProps> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const globalSDK = useGlobalSDK()
  const sync = useGlobalSync()
  const layout = useLayout()
  const navigate = useNavigate()
  const dialog = useDialog()

  const selectDirectory = (input: { title: string; multiple: boolean }) => {
    return new Promise<string | string[] | null>((resolve) => {
      dialog.show(
        () => <DialogSelectDirectory title={input.title} multiple={input.multiple} onSelect={resolve} />,
        () => resolve(null),
      )
    })
  }

  const openRepo = (repo: Repo) => {
    layout.projects.open(repo.path)
    navigate(`/${base64Encode(repo.path)}/session`)
  }

  return (
    <SettingsAuthProvider getServerUrl={() => server.url}>
      <Dialog size="x-large" transition>
        <Tabs
          orientation="vertical"
          variant="settings"
          defaultValue={props.initialTab ?? "general"}
          class="h-full settings-dialog"
        >
          <Tabs.List>
            <div class="flex flex-col justify-between h-full w-full">
              <div class="flex flex-col gap-3 w-full pt-3">
                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1.5">
                    <Tabs.SectionTitle>{language.t("settings.section.desktop")}</Tabs.SectionTitle>
                    <div class="flex flex-col gap-1.5 w-full">
                      <Tabs.Trigger value="general">
                        <Icon name="sliders" />
                        {language.t("settings.tab.general")}
                      </Tabs.Trigger>
                      <Tabs.Trigger value="welcome" data-action="settings-tab-welcome">
                        <Icon name="help" />
                        Welcome
                      </Tabs.Trigger>
                      <Tabs.Trigger value="shortcuts">
                        <Icon name="keyboard" />
                        {language.t("settings.tab.shortcuts")}
                      </Tabs.Trigger>
                    </div>
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <Tabs.SectionTitle>{language.t("settings.section.server")}</Tabs.SectionTitle>
                    <div class="flex flex-col gap-1.5 w-full">
                      <Tabs.Trigger value="providers">
                        <Icon name="providers" />
                        {language.t("settings.providers.title")}
                      </Tabs.Trigger>
                      <Tabs.Trigger value="models">
                        <Icon name="models" />
                        {language.t("settings.models.title")}
                      </Tabs.Trigger>
                      <Tabs.Trigger value="repositories" data-action="settings-tab-repositories">
                        <Icon name="folder" />
                        Repositories
                      </Tabs.Trigger>
                    </div>
                  </div>

                  <SettingsAuthenticationTabs />
                </div>
              </div>
              <div class="flex flex-col gap-1 pl-1 py-1 text-12-medium text-text-weak">
                <SettingsAuthFooterLogout />
                <span>{language.t("app.name.desktop")}</span>
                <span class="text-11-regular">v{platform.version}</span>
              </div>
            </div>
          </Tabs.List>
          <Tabs.Content value="general" class="no-scrollbar">
            <SettingsGeneral />
          </Tabs.Content>
          <Tabs.Content value="welcome" class="no-scrollbar">
            <SettingsWelcomeTab />
          </Tabs.Content>
          <Tabs.Content value="shortcuts" class="no-scrollbar">
            <SettingsKeybinds />
          </Tabs.Content>
          <Tabs.Content value="providers" class="no-scrollbar">
            <SettingsProviders />
          </Tabs.Content>
          <Tabs.Content value="models" class="no-scrollbar">
            <SettingsModels />
          </Tabs.Content>
          <Tabs.Content value="repositories" class="no-scrollbar">
            <SettingsRepositoriesTab
              client={globalSDK.client}
              server={server}
              platform={platform}
              homePath={sync.data.path.home}
              onOpenRepo={openRepo}
              onSelectDirectory={selectDirectory}
            />
          </Tabs.Content>
          <Tabs.Content value="auth-session" class="no-scrollbar">
            <SettingsAuthSessionTab />
          </Tabs.Content>
          <Tabs.Content value="auth-passkeys" class="no-scrollbar">
            <SettingsAuthPasskeysTab />
          </Tabs.Content>
          <Tabs.Content value="auth-2fa" class="no-scrollbar">
            <SettingsAuthTwoFactorTab />
          </Tabs.Content>
        </Tabs>
      </Dialog>
    </SettingsAuthProvider>
  )
}
