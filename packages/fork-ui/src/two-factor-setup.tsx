import { TwoFactorSetupFlow, type TwoFactorSetupBootstrap } from "./two-factor-setup-flow"

declare global {
  interface Window {
    __OPENCODE_2FA_SETUP__?: TwoFactorSetupBootstrap
  }
}

export function TwoFactorSetupApp() {
  return <TwoFactorSetupFlow bootstrap={window.__OPENCODE_2FA_SETUP__} />
}
