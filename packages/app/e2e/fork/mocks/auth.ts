import type { Page } from "@playwright/test"

export type TotpDeviceTrustStatus = {
  totpEnabled: boolean
  totpConfigured: boolean
  totpOptedOut: boolean
  deviceTrusted: boolean
}

interface DeviceTrustResponse {
  twoFactorEnabled: boolean
  twoFactorConfigured: boolean
  twoFactorOptedOut: boolean
  deviceTrusted: boolean
}

/** @deprecated Prefer TotpDeviceTrustStatus. */
export type DeviceTrustStatus = {
  twoFactorEnabled: boolean
  twoFactorConfigured: boolean
  twoFactorOptedOut: boolean
  deviceTrusted: boolean
}

type DeviceTrustStatusInput = Partial<
  TotpDeviceTrustStatus & {
    /** @deprecated Prefer `totpEnabled`. */
    twoFactorEnabled: boolean
    /** @deprecated Prefer `totpConfigured`. */
    twoFactorConfigured: boolean
    /** @deprecated Prefer `totpOptedOut`. */
    twoFactorOptedOut: boolean
  }
>

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

export interface TotpSetupStartMockOptions {
  username?: string
  secret?: string
  qrCodeSvg?: string
  setupCommand?: string
  alreadyConfigured?: boolean
  required?: boolean
  setupStatus?: string
  setupMessage?: string
}

/** @deprecated Prefer TotpSetupStartMockOptions. */
export type TwoFactorSetupStartMockOptions = TotpSetupStartMockOptions

export interface AuthenticatedAuthMockOptions {
  session?: string | AuthSessionMockOptions
  authStatus?: boolean | AuthStatusMockOptions
  totpTrust?: DeviceTrustStatusInput
  /** @deprecated Prefer `totpTrust`. */
  deviceTrust?: DeviceTrustStatusInput
}

export interface UnauthenticatedAuthMockOptions {
  authStatus?: boolean | AuthStatusMockOptions
}

const defaultTotpDeviceTrustStatus: TotpDeviceTrustStatus = {
  totpEnabled: true,
  totpConfigured: true,
  totpOptedOut: false,
  deviceTrusted: true,
}

function normalizeDeviceTrustStatus(input: DeviceTrustStatusInput): TotpDeviceTrustStatus {
  const maybeTotpEnabled = input.totpEnabled ?? input.twoFactorEnabled
  const maybeTotpConfigured = input.totpConfigured ?? input.twoFactorConfigured
  const maybeTotpOptedOut = input.totpOptedOut ?? input.twoFactorOptedOut

  return {
    totpEnabled: maybeTotpEnabled ?? defaultTotpDeviceTrustStatus.totpEnabled,
    totpConfigured: maybeTotpConfigured ?? defaultTotpDeviceTrustStatus.totpConfigured,
    totpOptedOut: maybeTotpOptedOut ?? defaultTotpDeviceTrustStatus.totpOptedOut,
    deviceTrusted: input.deviceTrusted ?? defaultTotpDeviceTrustStatus.deviceTrusted,
  }
}

export function toDeviceTrustResponse(input: DeviceTrustStatusInput = {}): DeviceTrustResponse {
  const status = normalizeDeviceTrustStatus(input)
  return {
    twoFactorEnabled: status.totpEnabled,
    twoFactorConfigured: status.totpConfigured,
    twoFactorOptedOut: status.totpOptedOut,
    deviceTrusted: status.deviceTrusted,
  }
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

export async function mockTotpDeviceTrust(page: Page, status: DeviceTrustStatusInput = {}) {
  await page.route("**/auth/device-trust/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(toDeviceTrustResponse(status)),
    })
  })
}

/** @deprecated Prefer mockTotpDeviceTrust. */
export const mockDeviceTrust = mockTotpDeviceTrust

export async function mockPasskeys(page: Page, credentials: unknown[] = []) {
  await page.route("**/auth/passkey/list", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ credentials }),
    })
  })
}

export async function mockTotpSetupStart(page: Page, input: TotpSetupStartMockOptions = {}) {
  const options = {
    username: input.username ?? "opencoder",
    secret: input.secret ?? "JBSWY3DPEHPK3PXP",
    qrCodeSvg: input.qrCodeSvg ?? '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"></svg>',
    setupCommand: input.setupCommand ?? "opencode auth 2fa setup",
    alreadyConfigured: input.alreadyConfigured ?? false,
    required: input.required ?? false,
    setupStatus: input.setupStatus ?? "pending_verification",
    setupMessage: input.setupMessage ?? "We'll create your TOTP configuration after you verify your code.",
  }

  await page.route("**/auth/2fa/setup/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options),
    })
  })
}

/** @deprecated Prefer mockTotpSetupStart. */
export const mockTwoFactorSetupStart = mockTotpSetupStart

export async function mockAuthenticatedAuth(page: Page, options: AuthenticatedAuthMockOptions = {}) {
  await mockSession(page, options.session)
  await mockAuthStatus(page, options.authStatus ?? true)
  await mockTotpDeviceTrust(page, options.totpTrust ?? options.deviceTrust)
}

export async function mockUnauthenticatedAuth(page: Page, options: UnauthenticatedAuthMockOptions = {}) {
  await mockNoSession(page)
  await mockAuthStatus(page, options.authStatus ?? true)
}
