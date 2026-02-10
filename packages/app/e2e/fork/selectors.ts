// Fork-specific selectors for authentication and repository features.
// Upstream selectors live in ../selectors.ts.

// --- Authentication ---
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

// --- Repositories ---
export const settingsRepositoriesTabSelector = '[data-action="settings-tab-repositories"]'
export const settingsRepositoriesRootSelector = '[data-action="settings-repositories-tab"]'
export const settingsRepositoriesOpenCloneSelector = '[data-action="settings-repositories-open-clone"]'
export const settingsRepositoriesSshKeysSelector = '[data-action="settings-repositories-ssh-keys"]'

export const homeRepoCloneCtaSelector = '[data-action="home-repo-clone-cta"]'
export const homeRepoManageCtaSelector = '[data-action="home-repo-manage-cta"]'

export const newSessionRepoSelector = '[data-action="new-session-repo-selector"]'
export const newSessionRepoCloneCtaSelector = '[data-action="new-session-repo-clone-cta"]'
export const newSessionRepoManageCtaSelector = '[data-action="new-session-repo-manage-cta"]'

export const repoSelectorCloneSelector = '[data-action="repo-selector-clone"]'
export const repoCloneHttpsWarningSelector = '[data-action="repo-clone-https-warning"]'
export const repoCloneSubmitSelector = '[data-action="repo-clone-submit"]'

// --- Welcome ---
export const settingsTabWelcomeSelector = '[data-action="settings-tab-welcome"]'
export const settingsWelcomeTabSelector = '[data-action="settings-welcome-tab"]'
export const settingsWelcomeShowModalSelector = '[data-action="settings-welcome-show-modal"]'
export const welcomeModalSelector = '[data-action="welcome-modal"]'
export const welcomeForkFeaturesSelector = '[data-action="welcome-fork-features"]'
export const welcomeForkRepoLinkSelector = '[data-action="welcome-link-opencode-fork"]'
export const welcomeBadgesRootSelector = '[data-action="welcome-badges-root"]'
export const welcomeBadgesCloudSectionSelector = '[data-action="welcome-badges-section-cloud"]'
export const welcomeBadgesOpencodeSectionSelector = '[data-action="welcome-badges-section-opencode"]'
export const welcomeBadgeItemSelector = '[data-action="welcome-badge-item"]'
