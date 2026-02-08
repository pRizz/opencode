export function wrapLayout<T>(layout: T): T {
  return layout
}

export function wrapRoutes<T>(routes: T): T {
  return routes
}

export { LoginApp } from "./login"
export { BootstrapSignupApp } from "./bootstrap-signup"
export { TwoFactorApp } from "./two-factor"
export { TwoFactorSetupApp } from "./two-factor-setup"
export { PasskeySetupApp } from "./passkey-setup"
export { ManageTwoFactorDialog } from "./manage-2fa-dialog"
export { PasskeyManagerDialog } from "./passkey-manager-dialog"
export { SessionIndicator } from "./session-indicator"
export { SessionExpiredOverlay } from "./session-expired-overlay"
export { SettingsAuthenticationSection } from "./settings-authentication-section"
export { SettingsAuthSessionTab } from "./settings-auth-session-tab"
export { SettingsAuthPasskeysTab } from "./settings-auth-passkeys-tab"
export { SettingsAuthTwoFactorTab } from "./settings-auth-twofactor-tab"
export { SettingsAuthFooterLogout } from "./settings-auth-footer-logout"
export { SettingsAuthProvider, useSettingsAuth } from "./settings-auth-state"
export { SecurityBadge } from "./security-badge"
export { HttpWarningBanner } from "./http-warning-banner"
export { createSessionExpirationWarning } from "./session-expiration-warning"
export { AuthGate, AuthRedirect } from "./auth-gate"
export { createCsrfFetch } from "./csrf-fetch"
export { formatAuthInitError } from "./auth-error"
export { CloneDialog } from "./repo/clone-dialog"
export { RepoSelector } from "./repo/repo-selector"
export { RepoSettingsDialog } from "./repo/repo-settings-dialog"
export { RepositoryManagerDialog } from "./repo/repository-manager-dialog"
export { formatRepoError, formatRepoErrorWithContext } from "./repo/repo-errors"
export { isHttpCloneUrl, isHttpsCloneUnsupported, isSshCloneUrl } from "./repo/clone-url-policy"
export { SshKeysDialog } from "./ssh-keys-dialog"
export { SettingsRepositoriesTab } from "./settings-repositories-tab"
export {
  useCloneProgress,
  type CloneAuthType,
  type UseCloneProgressOptions,
  type UseCloneProgressReturn,
  type CloneProgressServer,
  type CloneProgressPlatform,
} from "./use-clone-progress"
export { injectSecurityBadgeStyles } from "./security-badge-style"
export { checkEpoch } from "./epoch-cache"
