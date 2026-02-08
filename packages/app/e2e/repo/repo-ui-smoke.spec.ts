import { test, expect, type Page } from "@playwright/test"
import { mockAuthenticatedAuth } from "../mocks/auth"
import {
  homeRepoCloneCtaSelector,
  homeRepoManageCtaSelector,
  repoCloneHttpsWarningSelector,
  repoCloneSubmitSelector,
} from "../selectors"

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedAuth(page)
  await page.route("**/global/health*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ healthy: false, version: "e2e-smoke" }),
    })
  })
})

async function openCloneDialog(page: Page) {
  await page.goto("/")

  const cloneCta = page.locator(homeRepoCloneCtaSelector)
  await expect(cloneCta).toBeVisible()
  await cloneCta.click()

  const cloneDialog = page.getByRole("dialog").filter({ hasText: "Clone from URL" }).first()
  await expect(cloneDialog).toBeVisible()
  return cloneDialog
}

test("home shows clone/manage repo CTAs", async ({ page }) => {
  await page.goto("/")

  await expect(page.locator(homeRepoCloneCtaSelector)).toBeVisible()
  await expect(page.locator(homeRepoManageCtaSelector)).toBeVisible()
})

test("home clone CTA opens clone dialog", async ({ page }) => {
  const cloneDialog = await openCloneDialog(page)
  await expect(cloneDialog.getByLabel("Repository URL")).toBeVisible()
})

test("HTTPS clone URL shows warning and disables clone submit", async ({ page }) => {
  const cloneDialog = await openCloneDialog(page)

  await cloneDialog.getByLabel("Repository URL").fill("https://github.com/example/project.git")

  await expect(cloneDialog.locator(repoCloneHttpsWarningSelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeDisabled()
})

test("SSH clone URL does not show unsupported warning", async ({ page }) => {
  const cloneDialog = await openCloneDialog(page)

  await cloneDialog.getByLabel("Repository URL").fill("git@github.com:example/project.git")

  await expect(cloneDialog.locator(repoCloneHttpsWarningSelector)).toHaveCount(0)
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeEnabled()
})
