import { TotpSetupFlow, type TotpSetupBootstrap } from "./totp-setup-flow"

declare global {
  interface Window {
    __OPENCODE_TOTP_SETUP__?: TotpSetupBootstrap
    /** @deprecated Legacy bootstrap key retained for backward compatibility. */
    __OPENCODE_2FA_SETUP__?: TotpSetupBootstrap
  }
}

export function TotpSetupApp() {
  // Prefer the TOTP setup bootstrap key, while preserving the legacy key fallback.
  return <TotpSetupFlow bootstrap={window.__OPENCODE_TOTP_SETUP__ ?? window.__OPENCODE_2FA_SETUP__} />
}

/** @deprecated Prefer TotpSetupApp. */
export const TwoFactorSetupApp = TotpSetupApp
