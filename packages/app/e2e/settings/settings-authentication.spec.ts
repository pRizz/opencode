import { test, expect } from "../fixtures"
import type { Page } from "@playwright/test"
import { openSettings } from "../actions"
import {
  settingsAuth2faManageCardSelector,
  settingsAuth2faManageDisabledReasonSelector,
  settingsAuth2faSetupCardSelector,
  settingsAuthFooterLogoutSelector,
  settingsAuthNavSectionSelector,
  settingsAuthSessionForgetDeviceSelector,
  settingsAuthSessionLogoutAllSelector,
  settingsAuthTab2faSelector,
  settingsAuthTabPasskeysSelector,
  settingsAuthTabSessionSelector,
  settingsAuthenticationSectionSelector,
} from "../selectors"

type DeviceTrustStatus = {
  twoFactorEnabled: boolean
  twoFactorConfigured: boolean
  twoFactorOptedOut: boolean
  deviceTrusted: boolean
}

async function mockSession(page: Page, username = "opencoder") {
  await page.route("**/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "session-auth-test",
        username,
        createdAt: Date.now() - 60_000,
        lastAccessTime: Date.now(),
      }),
    })
  })
}

async function mockNoSession(page: Page) {
  await page.route("**/auth/session", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "not_authenticated" }),
    })
  })
}

async function mockAuthStatus(page: Page, passkeysEnabled: boolean) {
  await page.route("**/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        method: "pam",
        passkeysEnabled,
      }),
    })
  })
}

async function mockDeviceTrust(page: Page, status: DeviceTrustStatus) {
  await page.route("**/auth/device-trust/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(status),
    })
  })
}

async function mockPasskeys(page: Page, credentials: unknown[] = []) {
  await page.route("**/auth/passkey/list", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ credentials }),
    })
  })
}

async function mockTwoFactorSetupStart(page: Page) {
  await page.route("**/auth/2fa/setup/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        username: "opencoder",
        secret: "JBSWY3DPEHPK3PXP",
        qrCodeSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"></svg>',
        setupCommand: "opencode auth 2fa setup",
        alreadyConfigured: false,
        required: false,
        setupStatus: "pending_verification",
        setupMessage: "We'll create your 2FA configuration after you verify your code.",
      }),
    })
  })
}

test("authentication nav section renders", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: true,
  })

  await gotoSession()
  const settings = await openSettings(page)

  await expect(settings.locator(settingsAuthNavSectionSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTabSessionSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTabPasskeysSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTab2faSelector)).toBeVisible()
})

test("unauthenticated state disables auth tabs and hides footer logout", async ({ page, gotoSession }) => {
  await mockNoSession(page)

  await gotoSession()
  const settings = await openSettings(page)

  await expect(settings.locator(settingsAuthTabSessionSelector)).toBeDisabled()
  await expect(settings.locator(settingsAuthTabPasskeysSelector)).toBeDisabled()
  await expect(settings.locator(settingsAuthTab2faSelector)).toBeDisabled()
  await expect(settings.locator(settingsAuthFooterLogoutSelector)).toHaveCount(0)
})

test("authenticated state enables tabs and footer logout hits endpoint", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: true,
  })

  let logoutCalls = 0
  await page.route(/\/auth\/logout$/, async (route) => {
    if (route.request().method() === "POST") logoutCalls += 1
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "logout failed (expected in test)" }),
    })
  })

  await gotoSession()
  const settings = await openSettings(page)

  await expect(settings.locator(settingsAuthTabSessionSelector)).toBeEnabled()
  await expect(settings.locator(settingsAuthTabPasskeysSelector)).toBeEnabled()
  await expect(settings.locator(settingsAuthTab2faSelector)).toBeEnabled()

  const footerLogout = settings.locator(settingsAuthFooterLogoutSelector)
  await expect(footerLogout).toBeVisible()
  await footerLogout.click()
  await expect.poll(() => logoutCalls).toBe(1)
})

test("session tab exposes actions and handles trust state", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: false,
  })

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTabSessionSelector).click()
  await expect(settings.locator(settingsAuthSessionLogoutAllSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthSessionForgetDeviceSelector)).toBeDisabled()
})

test("session tab actions call logout-all and forget-device endpoints", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: true,
  })

  let logoutAllCalls = 0
  let forgetCalls = 0

  await page.route(/\/auth\/logout\/all$/, async (route) => {
    if (route.request().method() === "POST") logoutAllCalls += 1
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "logout-all failed (expected in test)" }),
    })
  })

  await page.route(/\/auth\/device-trust\/revoke$/, async (route) => {
    if (route.request().method() === "POST") forgetCalls += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  })

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTabSessionSelector).click()
  await settings.locator(settingsAuthSessionLogoutAllSelector).click()
  await expect.poll(() => logoutAllCalls).toBe(1)

  const forgetButton = settings.locator(settingsAuthSessionForgetDeviceSelector)
  await expect(forgetButton).toBeEnabled()
  await forgetButton.click()
  await expect.poll(() => forgetCalls).toBe(1)
})

test("passkeys tab remains reachable", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: true,
  })
  await mockPasskeys(page, [])

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTabPasskeysSelector).click()
  await expect(settings.getByRole("heading", { name: "Passkeys" })).toBeVisible()
  await expect(settings.getByRole("button", { name: "Add passkey" })).toBeVisible()
})

test("2FA tab shows setup and disabled manage when not configured", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: false,
    twoFactorOptedOut: false,
    deviceTrusted: false,
  })
  await mockTwoFactorSetupStart(page)

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTab2faSelector).click()
  await expect(settings.locator(settingsAuth2faSetupCardSelector)).toBeVisible()
  await expect(settings.locator(settingsAuth2faManageCardSelector)).toBeVisible()
  await expect(settings.locator(settingsAuth2faManageDisabledReasonSelector)).toBeVisible()
})

test("2FA inline setup enables manage panel without opening new tab", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)

  let deviceTrustCalls = 0
  await page.route("**/auth/device-trust/status", async (route) => {
    deviceTrustCalls += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        twoFactorEnabled: true,
        twoFactorConfigured: deviceTrustCalls > 1,
        twoFactorOptedOut: false,
        deviceTrusted: false,
      }),
    })
  })

  await mockTwoFactorSetupStart(page)

  let verifyCalls = 0
  await page.route(/\/auth\/2fa\/verify$/, async (route) => {
    if (route.request().method() === "POST") verifyCalls += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  })

  let popupCount = 0
  page.on("popup", () => {
    popupCount += 1
  })

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTab2faSelector).click()
  await expect(settings.locator(settingsAuth2faManageDisabledReasonSelector)).toBeVisible()

  await settings.locator("#two-factor-setup-code").fill("123456")
  await settings.getByRole("button", { name: "Verify & Enable 2FA" }).click()

  await expect.poll(() => verifyCalls).toBe(1)
  await expect(settings.locator('[data-action="settings-auth-2fa-manage-panel"]')).toBeVisible()
  await expect.poll(() => popupCount).toBe(0)
})

test("2FA manage actions hit reset and disable endpoints", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: true,
  })
  await mockTwoFactorSetupStart(page)

  let resetCalls = 0
  let disableCalls = 0

  await page.route(/\/auth\/2fa\/reset$/, async (route) => {
    if (route.request().method() === "POST") resetCalls += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  })

  await page.route(/\/auth\/2fa\/disable$/, async (route) => {
    if (route.request().method() === "POST") disableCalls += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  })

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTab2faSelector).click()

  await settings.locator('[data-action="settings-auth-2fa-manage-reset"]').click()
  await settings.getByRole("button", { name: "Confirm reset" }).click()
  await expect.poll(() => resetCalls).toBe(1)

  await settings.locator('[data-action="settings-auth-2fa-manage-disable"]').click()
  await settings.getByRole("button", { name: "Confirm disable" }).click()
  await expect.poll(() => disableCalls).toBe(1)
})

test("no authentication access remains in General section", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockAuthStatus(page, true)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: true,
  })

  await gotoSession()
  const settings = await openSettings(page)
  await settings.getByRole("tab", { name: "General" }).click()
  await expect(settings.locator(settingsAuthenticationSectionSelector)).toHaveCount(0)
})
