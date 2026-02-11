import { test, expect, type Page } from "@playwright/test"
import { mockAuthenticatedAuth } from "../mocks/auth"
import { createMockSshKey, mockSshKeys } from "../mocks/ssh-keys"
import {
  homeRepoCloneCtaSelector,
  homeRepoManageCtaSelector,
  repoCloneCopyPublicKeySelector,
  repoCloneGenerateKeySelector,
  repoCloneGeneratedPublicKeySelector,
  repoCloneHttpsWarningSelector,
  repoCloneNoSshKeysSelector,
  repoCloneSecurityContentSelector,
  repoCloneSecurityHygieneSelector,
  repoCloneSecurityToggleSelector,
  repoCloneSubmitSelector,
} from "../selectors"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("opencode.fork.dat:welcome.v1", "seen"))
  await mockAuthenticatedAuth(page)
  await page.route("**/global/health*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ healthy: false, version: "e2e-smoke" }),
    })
  })
})

async function openCloneDialog(page: Page, options?: { hasKey?: boolean }) {
  await mockSshKeys(page, {
    initialKeys: options?.hasKey === false ? [] : [createMockSshKey({ hosts: ["github.com"] })],
  })

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

test("clone dialog eagerly shows missing SSH key banner when no keys are configured", async ({ page }) => {
  const cloneDialog = await openCloneDialog(page, { hasKey: false })

  await expect(cloneDialog.locator(repoCloneNoSshKeysSelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeDisabled()
})

test("HTTPS clone URL shows warning and disables clone submit", async ({ page }) => {
  const cloneDialog = await openCloneDialog(page)

  await cloneDialog.getByLabel("Repository URL").fill("https://github.com/example/project.git")

  await expect(cloneDialog.locator(repoCloneHttpsWarningSelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeDisabled()
})

test("SSH clone URL does not show unsupported warning when keys exist", async ({ page }) => {
  const cloneDialog = await openCloneDialog(page)

  await cloneDialog.getByLabel("Repository URL").fill("git@github.com:example/project.git")

  await expect(cloneDialog.locator(repoCloneHttpsWarningSelector)).toHaveCount(0)
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeEnabled()
})

test("generate SSH key flow shows security details and unblocks clone", async ({ page }) => {
  const cloneDialog = await openCloneDialog(page, { hasKey: false })

  await cloneDialog.getByLabel("Repository URL").fill("git@github.com:example/project.git")

  await cloneDialog.locator(repoCloneSecurityToggleSelector).click()
  await expect(cloneDialog.locator(repoCloneSecurityContentSelector)).toContainText("Ed25519")

  const generateRequest = page.waitForRequest((request) => {
    return request.method() === "POST" && request.url().includes("/ssh-keys/generate")
  })

  await cloneDialog.locator(repoCloneGenerateKeySelector).click()

  const request = await generateRequest
  const payload = (request.postDataJSON() ?? {}) as {
    sshKeyGenerateInput?: { hosts?: string[] }
    hosts?: string[]
  }
  const body = payload.sshKeyGenerateInput ?? payload
  expect(body.hosts?.[0]).toBe("github.com")

  await expect(cloneDialog.locator(repoCloneGeneratedPublicKeySelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneCopyPublicKeySelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneSecurityHygieneSelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeEnabled()
})
