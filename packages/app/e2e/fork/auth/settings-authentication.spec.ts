import { test, expect } from "../../fixtures"
import { closeDialog, openSettings } from "../../actions"
import { mockAuthenticatedAuth, mockPasskeys, mockTwoFactorSetupStart, mockUnauthenticatedAuth } from "../mocks/auth"
import {
  settingsAuthTotpManageCardSelector,
  settingsAuthTotpManageDisabledReasonSelector,
  settingsAuthTotpSetupCardSelector,
  settingsAuthFooterLogoutSelector,
  settingsAuthNavSectionSelector,
  settingsAuthSessionForgetDeviceSelector,
  settingsAuthSessionLogoutAllSelector,
  settingsAuthTabTotpSelector,
  settingsAuthTabPasskeysSelector,
  settingsAuthTabSessionSelector,
  settingsAuthenticationSectionSelector,
} from "../selectors"

test("authentication nav section renders", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page)

  await gotoSession()
  const settings = await openSettings(page)

  await expect(settings.locator(settingsAuthNavSectionSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTabSessionSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTabPasskeysSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTabTotpSelector)).toBeVisible()
})

test("unauthenticated state disables auth tabs and hides footer logout", async ({ page, gotoSession }) => {
  await mockUnauthenticatedAuth(page)

  await gotoSession()
  const settings = await openSettings(page)

  await expect(settings.locator(settingsAuthTabSessionSelector)).toBeDisabled()
  await expect(settings.locator(settingsAuthTabPasskeysSelector)).toBeDisabled()
  await expect(settings.locator(settingsAuthTabTotpSelector)).toBeDisabled()
  await expect(settings.locator(settingsAuthFooterLogoutSelector)).toHaveCount(0)
})

test("authenticated state enables tabs and footer logout hits endpoint", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page)

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
  await expect(settings.locator(settingsAuthTabTotpSelector)).toBeEnabled()

  const footerLogout = settings.locator(settingsAuthFooterLogoutSelector)
  await expect(footerLogout).toBeVisible()
  await footerLogout.click()
  await expect.poll(() => logoutCalls).toBe(1)
})

test("session tab exposes actions and handles trust state", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page, {
    deviceTrust: {
      deviceTrusted: false,
    },
  })

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTabSessionSelector).click()
  await expect(settings.locator(settingsAuthSessionLogoutAllSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthSessionForgetDeviceSelector)).toBeDisabled()
})

test("session tab actions call logout-all and forget-device endpoints", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page)

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
  await mockAuthenticatedAuth(page)
  await mockPasskeys(page, [])

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTabPasskeysSelector).click()
  await expect(settings.getByRole("heading", { name: "Passkeys" })).toBeVisible()
  await expect(settings.getByRole("button", { name: "Add passkey" })).toBeVisible()
})

test("TOTP tab shows setup and disabled manage when not configured", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page, {
    deviceTrust: {
      twoFactorConfigured: false,
      deviceTrusted: false,
    },
  })
  await mockTwoFactorSetupStart(page)

  await gotoSession()
  const settings = await openSettings(page)

  await settings.locator(settingsAuthTabTotpSelector).click()
  await expect(settings.locator(settingsAuthTotpSetupCardSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTotpManageCardSelector)).toBeVisible()
  await expect(settings.locator(settingsAuthTotpManageDisabledReasonSelector)).toBeVisible()
})

test("TOTP inline setup enables manage panel without opening new tab", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page)

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

  await settings.locator(settingsAuthTabTotpSelector).click()
  await expect(settings.locator(settingsAuthTotpManageDisabledReasonSelector)).toBeVisible()

  await settings.locator("#two-factor-setup-code").fill("123456")
  await settings.getByRole("button", { name: "Verify & Enable TOTP" }).click()

  await expect.poll(() => verifyCalls).toBe(1)
  await expect(settings.locator('[data-action="settings-auth-totp-manage-panel"]')).toBeVisible()
  await expect.poll(() => popupCount).toBe(0)
})

test("TOTP manage actions hit reset and disable endpoints", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page)
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

  await settings.locator(settingsAuthTabTotpSelector).click()

  await settings.locator('[data-action="settings-auth-totp-manage-reset"]').click()
  await settings.getByRole("button", { name: "Confirm reset" }).click()
  await expect.poll(() => resetCalls).toBe(1)

  await closeDialog(page, settings)

  const settingsAfterReset = await openSettings(page)
  await settingsAfterReset.locator(settingsAuthTabTotpSelector).click()

  await settingsAfterReset.locator('[data-action="settings-auth-totp-manage-disable"]').click()
  await settingsAfterReset.getByRole("button", { name: "Confirm disable" }).click()
  await expect.poll(() => disableCalls).toBe(1)
})

test("no authentication access remains in General section", async ({ page, gotoSession }) => {
  await mockAuthenticatedAuth(page)

  await gotoSession()
  const settings = await openSettings(page)
  await settings.getByRole("tab", { name: "General" }).click()
  await expect(settings.locator(settingsAuthenticationSectionSelector)).toHaveCount(0)
})
