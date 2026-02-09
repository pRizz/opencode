import type { Page } from "@playwright/test"

export type DeviceTrustStatus = {
  twoFactorEnabled: boolean
  twoFactorConfigured: boolean
  twoFactorOptedOut: boolean
  deviceTrusted: boolean
}

export interface AuthSessionMockOptions {
  id?: string
  username?: string
  createdAt?: number
  lastAccessTime?: number
}

export interface AuthStatusMockOptions {
  enabled?: boolean
  method?: string
  passkeysEnabled?: boolean
}

export interface TwoFactorSetupStartMockOptions {
  username?: string
  secret?: string
  qrCodeSvg?: string
  setupCommand?: string
  alreadyConfigured?: boolean
  required?: boolean
  setupStatus?: string
  setupMessage?: string
}

export interface AuthenticatedAuthMockOptions {
  session?: string | AuthSessionMockOptions
  authStatus?: boolean | AuthStatusMockOptions
  deviceTrust?: Partial<DeviceTrustStatus>
}

export interface UnauthenticatedAuthMockOptions {
  authStatus?: boolean | AuthStatusMockOptions
}

const defaultDeviceTrustStatus: DeviceTrustStatus = {
  twoFactorEnabled: true,
  twoFactorConfigured: true,
  twoFactorOptedOut: false,
  deviceTrusted: true,
}

function resolveSessionMock(input?: string | AuthSessionMockOptions): Required<AuthSessionMockOptions> {
  const now = Date.now()
  const value = typeof input === "string" ? { username: input } : (input ?? {})
  return {
    id: value.id ?? "session-auth-test",
    username: value.username ?? "opencoder",
    createdAt: value.createdAt ?? now - 60_000,
    lastAccessTime: value.lastAccessTime ?? now,
  }
}

export async function mockSession(page: Page, input?: string | AuthSessionMockOptions) {
  const session = resolveSessionMock(input)
  await page.route("**/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(session),
    })
  })
}

export async function mockNoSession(page: Page) {
  await page.route("**/auth/session", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "not_authenticated" }),
    })
  })
}

export async function mockAuthStatus(page: Page, input?: boolean | AuthStatusMockOptions) {
  const options = typeof input === "boolean" ? { passkeysEnabled: input } : (input ?? {})
  await page.route("**/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: options.enabled ?? true,
        method: options.method ?? "pam",
        passkeysEnabled: options.passkeysEnabled ?? true,
      }),
    })
  })
}

export async function mockDeviceTrust(page: Page, status: Partial<DeviceTrustStatus> = {}) {
  await page.route("**/auth/device-trust/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...defaultDeviceTrustStatus, ...status }),
    })
  })
}

export async function mockPasskeys(page: Page, credentials: unknown[] = []) {
  await page.route("**/auth/passkey/list", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ credentials }),
    })
  })
}

export async function mockTwoFactorSetupStart(page: Page, input: TwoFactorSetupStartMockOptions = {}) {
  const options = {
    username: input.username ?? "opencoder",
    secret: input.secret ?? "JBSWY3DPEHPK3PXP",
    qrCodeSvg: input.qrCodeSvg ?? '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"></svg>',
    setupCommand: input.setupCommand ?? "opencode auth 2fa setup",
    alreadyConfigured: input.alreadyConfigured ?? false,
    required: input.required ?? false,
    setupStatus: input.setupStatus ?? "pending_verification",
    setupMessage: input.setupMessage ?? "We'll create your 2FA configuration after you verify your code.",
  }

  await page.route("**/auth/2fa/setup/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options),
    })
  })
}

export async function mockAuthenticatedAuth(page: Page, options: AuthenticatedAuthMockOptions = {}) {
  await mockSession(page, options.session)
  await mockAuthStatus(page, options.authStatus ?? true)
  await mockDeviceTrust(page, options.deviceTrust)
}

export async function mockUnauthenticatedAuth(page: Page, options: UnauthenticatedAuthMockOptions = {}) {
  await mockNoSession(page)
  await mockAuthStatus(page, options.authStatus ?? true)
}
