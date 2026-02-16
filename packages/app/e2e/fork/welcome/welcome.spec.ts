import { test, expect } from "../../fixtures"
import { openSettings } from "../../actions"
import {
  settingsTabWelcomeSelector,
  settingsWelcomeShowModalSelector,
  settingsWelcomeTabSelector,
  welcomeBadgeItemSelector,
  welcomeBadgesCloudSectionSelector,
  welcomeBadgesOpencodeSectionSelector,
  welcomeBadgesRootSelector,
  welcomeForkFeaturesSelector,
  welcomeForkRepoLinkSelector,
  welcomeModalSelector,
} from "../selectors"

const welcomeDir = process.env.OPENCODE_E2E_WELCOME_DIR ?? "/tmp/opencode-welcome-e2e"
const welcomeKey = "opencode.fork.dat:welcome.v1"
const fakeDir = Buffer.from(welcomeDir).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")

test.skip(process.env.OPENCODE_E2E_SKIP_FLAKY === "1", "Skipping welcome suite in flaky E2E quarantine mode")

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

  const badgeRoot = modal.locator(welcomeBadgesRootSelector)
  await expect(badgeRoot).toBeVisible()

  const cloudSection = badgeRoot.locator(welcomeBadgesCloudSectionSelector)
  const opencodeSection = badgeRoot.locator(welcomeBadgesOpencodeSectionSelector)

  await expect(cloudSection).toContainText("OpenCode Cloud (superproject README badges)")
  await expect(opencodeSection).toContainText("OpenCode base/fork (packages/opencode README badges)")
  await expect(cloudSection.locator(welcomeBadgeItemSelector)).toHaveCount(5)
  await expect(opencodeSection.locator(welcomeBadgeItemSelector)).toHaveCount(3)
  await expect(badgeRoot.locator(welcomeBadgeItemSelector)).toHaveCount(8)

  const cloudBadgeData = await cloudSection.locator(welcomeBadgeItemSelector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const image = node.querySelector("img")
      return {
        id: node.getAttribute("data-badge-id"),
        href: node.getAttribute("href"),
        cursor: getComputedStyle(node).cursor,
        imageSrc: image?.getAttribute("src") ?? null,
      }
    }),
  )

  const opencodeBadgeData = await opencodeSection.locator(welcomeBadgeItemSelector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const image = node.querySelector("img")
      return {
        id: node.getAttribute("data-badge-id"),
        href: node.getAttribute("href"),
        cursor: getComputedStyle(node).cursor,
        imageSrc: image?.getAttribute("src") ?? null,
      }
    }),
  )

  expect(cloudBadgeData).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "cloud-github-stars",
        href: "https://github.com/pRizz/opencode-cloud",
        cursor: "pointer",
        imageSrc: "https://img.shields.io/github/stars/pRizz/opencode-cloud",
      }),
    ]),
  )

  expect(opencodeBadgeData).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "opencode-discord",
        href: "https://opencode.ai/discord",
        cursor: "pointer",
        imageSrc: "https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord",
      }),
    ]),
  )

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

test("welcome modal scrolls vertically on small screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto("/")

  const modal = page.locator(welcomeModalSelector)
  await expect(modal).toBeVisible()

  const before = await modal.evaluate((node) => ({
    scrollTop: node.scrollTop,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }))
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight)

  await modal.hover()
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(150)

  const afterScrollTop = await modal.evaluate((node) => node.scrollTop)
  expect(afterScrollTop).toBeGreaterThan(before.scrollTop)
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
