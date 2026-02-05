export function wrapLayout<T>(layout: T): T {
  return layout
}

export function wrapRoutes<T>(routes: T): T {
  return routes
}

export { LoginApp } from "./login"
export { TwoFactorApp } from "./two-factor"
export { TwoFactorSetupApp } from "./two-factor-setup"
