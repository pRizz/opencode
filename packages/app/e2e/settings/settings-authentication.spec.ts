import { test, expect } from "../fixtures"
import type { Page } from "@playwright/test"
import { openSettings } from "../actions"
import {
  settingsAuthenticationSectionSelector,
  settingsAuthenticationAccountRowSelector,
  settingsAuthenticationMenuTriggerSelector,
  settingsAuthenticationMenu2faSelector,
  settingsAuthenticationMenuPasskeysSelector,
  settingsAuthenticationMenuLogoutSelector,
  settingsAuthenticationMenuLogoutAllSelector,
  settingsAuthenticationMenuForgetDeviceSelector,
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

test("authentication section hidden when no session", async ({ page, gotoSession }) => {
  await gotoSession()
  const settings = await openSettings(page)
  await expect(settings.locator(settingsAuthenticationSectionSelector)).toHaveCount(0)
})

test("authentication section visible for authenticated session", async ({ page, gotoSession }) => {
  await mockSession(page)
  await gotoSession()
  const settings = await openSettings(page)

  await expect(settings.locator(settingsAuthenticationSectionSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthenticationAccountRowSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthenticationMenuTriggerSelector)).toBeVisible()
})

test("menu exposes session and authentication controls", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: true,
  })
  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthenticationMenuTriggerSelector).click()
  await expect(page.locator(settingsAuthenticationMenuForgetDeviceSelector)).toBeVisible()
  await expect(page.locator(settingsAuthenticationMenu2faSelector)).toBeVisible()
  await expect(page.locator(settingsAuthenticationMenuPasskeysSelector)).toBeVisible()
  await expect(page.locator(settingsAuthenticationMenuLogoutSelector)).toBeVisible()
  await expect(page.locator(settingsAuthenticationMenuLogoutAllSelector)).toBeVisible()
})

test("manage passkeys remains reachable", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: false,
  })
  await mockPasskeys(page, [])
  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthenticationMenuTriggerSelector).click()
  await page.locator(settingsAuthenticationMenuPasskeysSelector).click()

  const dialog = page.getByRole("dialog").filter({ hasText: "Manage passkeys" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Add passkey" })).toBeVisible()
})

test("manage 2FA remains reachable", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: false,
  })
  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthenticationMenuTriggerSelector).click()
  await page.locator(settingsAuthenticationMenu2faSelector).click()

  const dialog = page.getByRole("dialog").filter({ hasText: "Manage 2FA" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Reset 2FA" })).toBeVisible()
})

test("logout actions still hit endpoints", async ({ page, gotoSession }) => {
  await mockSession(page)
  await mockDeviceTrust(page, {
    twoFactorEnabled: true,
    twoFactorConfigured: true,
    twoFactorOptedOut: false,
    deviceTrusted: false,
  })

  let logoutCalls = 0
  let logoutAllCalls = 0

  await page.route(/\/auth\/logout$/, async (route) => {
    if (route.request().method() === "POST") logoutCalls += 1
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "logout failed (expected in test)" }),
    })
  })

  await page.route(/\/auth\/logout\/all$/, async (route) => {
    if (route.request().method() === "POST") logoutAllCalls += 1
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "logout all failed (expected in test)" }),
    })
  })

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthenticationMenuTriggerSelector).click()
  await page.locator(settingsAuthenticationMenuLogoutSelector).click()
  await expect.poll(() => logoutCalls).toBe(1)

  await settings.locator(settingsAuthenticationMenuTriggerSelector).click()
  await page.locator(settingsAuthenticationMenuLogoutAllSelector).click()
  await expect.poll(() => logoutAllCalls).toBe(1)
})
