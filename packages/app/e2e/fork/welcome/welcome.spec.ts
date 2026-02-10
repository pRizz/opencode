import { test, expect } from "../../fixtures"
import { openSettings } from "../../actions"
import {
  settingsTabWelcomeSelector,
  settingsWelcomeShowModalSelector,
  settingsWelcomeTabSelector,
  welcomeForkFeaturesSelector,
  welcomeForkRepoLinkSelector,
  welcomeModalSelector,
} from "../selectors"

const welcomeKey = "opencode.fork.dat:welcome.v1"
const fakeDir = Buffer.from("/tmp/opencode-welcome-e2e")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "")

async function showWelcomeFromSettings(page: Parameters<typeof openSettings>[0]) {
  const settings = await openSettings(page)
  await settings.locator(settingsTabWelcomeSelector).click()
  await expect(settings.locator(settingsWelcomeTabSelector)).toBeVisible()
  await settings.locator(settingsWelcomeShowModalSelector).click()
  await expect(page.locator(welcomeModalSelector)).toBeVisible()
}

test("auto-shows welcome modal on first home visit", async ({ page }) => {
  await page.goto("/")

  const modal = page.locator(welcomeModalSelector)
  await expect(modal).toBeVisible()
  const features = modal.locator(welcomeForkFeaturesSelector)
  await expect(features).toBeVisible()
  await expect(features).toContainText("Passkey-first authentication")

  const forkLink = modal.locator(welcomeForkRepoLinkSelector)
  await expect(forkLink).toBeVisible()
  await expect(forkLink).toHaveAttribute("href", "https://github.com/pRizz/opencode")
  await expect(forkLink).toHaveCSS("cursor", "pointer")

  const value = await page.evaluate((key) => localStorage.getItem(key), welcomeKey)
  expect(value).toBe("seen")
})

test("does not auto-show welcome modal after dismiss + reload", async ({ page }) => {
  await page.goto("/")

  const modal = page.locator(welcomeModalSelector)
  await expect(modal).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(modal).toHaveCount(0)

  await page.reload()
  await page.waitForTimeout(400)
  await expect(modal).toHaveCount(0)
})

test("settings welcome tab can reopen modal", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "seen"), welcomeKey)
  await page.goto("/")
  await showWelcomeFromSettings(page)
  await expect(page.locator(welcomeModalSelector)).toBeVisible()
})

test("direct session route does not auto-show welcome modal", async ({ page }) => {
  await page.goto(`/${fakeDir}/session`)
  await page.waitForTimeout(400)
  await expect(page.locator(welcomeModalSelector)).toHaveCount(0)
})

test("welcome modal closes via escape and overlay", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "seen"), welcomeKey)
  await page.goto("/")

  const modal = page.locator(welcomeModalSelector)

  await showWelcomeFromSettings(page)
  await page.keyboard.press("Escape")
  await expect(modal).toHaveCount(0)

  await showWelcomeFromSettings(page)
  await page.locator('[data-component="dialog-overlay"]').click({ position: { x: 5, y: 5 } })
  await expect(modal).toHaveCount(0)
})
