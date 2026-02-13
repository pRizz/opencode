import { TwoFactorSetupFlow, type TwoFactorSetupBootstrap } from "./two-factor-setup-flow"

declare global {
  interface Window {
    __OPENCODE_TOTP_SETUP__?: TwoFactorSetupBootstrap
    /** @deprecated Legacy bootstrap key retained for backward compatibility. */
    __OPENCODE_2FA_SETUP__?: TwoFactorSetupBootstrap
  }
}

export function TwoFactorSetupApp() {
  // Prefer the TOTP setup bootstrap key, while preserving the legacy key fallback.
  return <TwoFactorSetupFlow bootstrap={window.__OPENCODE_TOTP_SETUP__ ?? window.__OPENCODE_2FA_SETUP__} />
}
