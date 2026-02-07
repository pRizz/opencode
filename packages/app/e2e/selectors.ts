export const promptSelector = '[data-component="prompt-input"]'
export const terminalSelector = '[data-component="terminal"]'

export const modelVariantCycleSelector = '[data-action="model-variant-cycle"]'
export const settingsLanguageSelectSelector = '[data-action="settings-language"]'
export const settingsColorSchemeSelector = '[data-action="settings-color-scheme"]'
export const settingsThemeSelector = '[data-action="settings-theme"]'
export const settingsFontSelector = '[data-action="settings-font"]'
export const settingsNotificationsAgentSelector = '[data-action="settings-notifications-agent"]'
export const settingsNotificationsPermissionsSelector = '[data-action="settings-notifications-permissions"]'
export const settingsNotificationsErrorsSelector = '[data-action="settings-notifications-errors"]'
export const settingsSoundsAgentSelector = '[data-action="settings-sounds-agent"]'
export const settingsSoundsPermissionsSelector = '[data-action="settings-sounds-permissions"]'
export const settingsSoundsErrorsSelector = '[data-action="settings-sounds-errors"]'
export const settingsUpdatesStartupSelector = '[data-action="settings-updates-startup"]'
export const settingsReleaseNotesSelector = '[data-action="settings-release-notes"]'
export const settingsAuthNavSectionSelector = '[data-action="settings-auth-nav-section"]'
export const settingsAuthTabSessionSelector = '[data-action="settings-auth-tab-session"]'
export const settingsAuthTabPasskeysSelector = '[data-action="settings-auth-tab-passkeys"]'
export const settingsAuthTab2faSelector = '[data-action="settings-auth-tab-2fa"]'
export const settingsAuthSessionForgetDeviceSelector = '[data-action="settings-auth-session-forget-device"]'
export const settingsAuthSessionLogoutAllSelector = '[data-action="settings-auth-session-logout-all"]'
export const settingsAuth2faSetupCardSelector = '[data-action="settings-auth-2fa-setup-card"]'
export const settingsAuth2faManageCardSelector = '[data-action="settings-auth-2fa-manage-card"]'
export const settingsAuth2faManageDisabledReasonSelector = '[data-action="settings-auth-2fa-manage-disabled-reason"]'
export const settingsAuthFooterLogoutSelector = '[data-action="settings-auth-footer-logout"]'
export const settingsAuthenticationSectionSelector = '[data-action="settings-authentication-section"]'
export const settingsAuthenticationAccountRowSelector = '[data-action="settings-authentication-account-row"]'
export const settingsAuthenticationMenuTriggerSelector = '[data-action="settings-authentication-menu-trigger"]'
export const settingsAuthenticationMenu2faSelector = '[data-action="settings-authentication-menu-2fa"]'
export const settingsAuthenticationMenuPasskeysSelector = '[data-action="settings-authentication-menu-passkeys"]'
export const settingsAuthenticationMenuLogoutSelector = '[data-action="settings-authentication-menu-logout"]'
export const settingsAuthenticationMenuLogoutAllSelector = '[data-action="settings-authentication-menu-logout-all"]'
export const settingsAuthenticationMenuForgetDeviceSelector = '[data-action="settings-authentication-menu-forget-device"]'

export const sidebarNavSelector = '[data-component="sidebar-nav-desktop"]'

export const projectSwitchSelector = (slug: string) =>
  `${sidebarNavSelector} [data-action="project-switch"][data-project="${slug}"]`

export const projectCloseHoverSelector = (slug: string) => `[data-action="project-close-hover"][data-project="${slug}"]`

export const projectMenuTriggerSelector = (slug: string) =>
  `${sidebarNavSelector} [data-action="project-menu"][data-project="${slug}"]`

export const projectCloseMenuSelector = (slug: string) => `[data-action="project-close-menu"][data-project="${slug}"]`

export const projectWorkspacesToggleSelector = (slug: string) =>
  `[data-action="project-workspaces-toggle"][data-project="${slug}"]`

export const titlebarRightSelector = "#opencode-titlebar-right"

export const popoverBodySelector = '[data-slot="popover-body"]'

export const dropdownMenuTriggerSelector = '[data-slot="dropdown-menu-trigger"]'

export const dropdownMenuContentSelector = '[data-component="dropdown-menu-content"]'

export const inlineInputSelector = '[data-component="inline-input"]'

export const sessionItemSelector = (sessionID: string) => `${sidebarNavSelector} [data-session-id="${sessionID}"]`

export const workspaceItemSelector = (slug: string) =>
  `${sidebarNavSelector} [data-component="workspace-item"][data-workspace="${slug}"]`

export const workspaceMenuTriggerSelector = (slug: string) =>
  `${sidebarNavSelector} [data-action="workspace-menu"][data-workspace="${slug}"]`

export const listItemSelector = '[data-slot="list-item"]'

export const listItemKeyStartsWithSelector = (prefix: string) => `${listItemSelector}[data-key^="${prefix}"]`

export const listItemKeySelector = (key: string) => `${listItemSelector}[data-key="${key}"]`

export const keybindButtonSelector = (id: string) => `[data-keybind-id="${id}"]`
