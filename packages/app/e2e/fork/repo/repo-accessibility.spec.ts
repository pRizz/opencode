import { test, expect } from "../../fixtures"
import { openSettings } from "../../actions"
import { mockAuthenticatedAuth } from "../mocks/auth"
import { createMockSshKey, mockSshKeys } from "../mocks/ssh-keys"
import {
  homeRepoCloneCtaSelector,
  homeRepoManageCtaSelector,
  newSessionRepoCloneCtaSelector,
  newSessionRepoManageCtaSelector,
  newSessionRepoSelector,
  repoCloneHttpsWarningSelector,
  repoCloneNoSshKeysSelector,
  repoCloneSecurityContentSelector,
  repoCloneSecurityToggleSelector,
  repoCloneSubmitSelector,
  repoSelectorCloneSelector,
  settingsRepositoriesOpenCloneSelector,
  settingsRepositoriesRootSelector,
  settingsRepositoriesSshKeysSelector,
  settingsRepositoriesTabSelector,
} from "../selectors"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("opencode.fork.dat:welcome.v1", "seen"))
  await mockAuthenticatedAuth(page)
})

async function openCloneDialogFromSettings(
  page: Parameters<typeof openSettings>[0],
  gotoSession: () => Promise<void>,
  options?: { hasKey?: boolean },
) {
  await mockSshKeys(page, {
    initialKeys: options?.hasKey === false ? [] : [createMockSshKey({ hosts: ["github.com"] })],
  })

  await gotoSession()
  const settings = await openSettings(page)
  await settings.locator(settingsRepositoriesTabSelector).click()
  await expect(settings.locator(settingsRepositoriesRootSelector)).toBeVisible()

  const openClone = settings.locator(settingsRepositoriesOpenCloneSelector)
  await expect(openClone).toBeVisible()
  await openClone.click()

  const cloneDialog = page.getByRole("dialog").filter({ hasText: "Clone from URL" }).first()
  await expect(cloneDialog).toBeVisible()
  return cloneDialog
}

test("home shows clone/manage repo CTAs", async ({ page }) => {
  await page.goto("/")

  await expect(page.locator(homeRepoCloneCtaSelector)).toBeVisible()
  await expect(page.locator(homeRepoManageCtaSelector)).toBeVisible()
})

test("new session shows repository selector and clone access", async ({ page, gotoSession }) => {
  await gotoSession()

  await expect(page.locator(newSessionRepoSelector)).toBeVisible()
  await expect(page.locator(newSessionRepoCloneCtaSelector)).toBeVisible()
  await expect(page.locator(newSessionRepoManageCtaSelector)).toBeVisible()
  await expect(page.locator(repoSelectorCloneSelector)).toBeVisible()
})

test("settings exposes repositories tab and SSH key management", async ({ page, gotoSession }) => {
  await gotoSession()

  const settings = await openSettings(page)
  await settings.locator(settingsRepositoriesTabSelector).click()

  await expect(settings.locator(settingsRepositoriesRootSelector)).toBeVisible()
  await expect(settings.locator(settingsRepositoriesSshKeysSelector)).toBeVisible()
})

test("HTTPS clone URL shows warning and disables clone submit", async ({ page, gotoSession }) => {
  const cloneDialog = await openCloneDialogFromSettings(page, gotoSession)

  await cloneDialog.getByLabel("Repository URL").fill("https://github.com/example/project.git")

  await expect(cloneDialog.locator(repoCloneHttpsWarningSelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeDisabled()
})

test("SSH clone URL does not show unsupported warning when keys exist", async ({ page, gotoSession }) => {
  const cloneDialog = await openCloneDialogFromSettings(page, gotoSession)

  await cloneDialog.getByLabel("Repository URL").fill("git@github.com:example/project.git")

  await expect(cloneDialog.locator(repoCloneHttpsWarningSelector)).toHaveCount(0)
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeEnabled()
})

test("clone dialog blocks clone and shows key-required state when no keys exist", async ({ page, gotoSession }) => {
  const cloneDialog = await openCloneDialogFromSettings(page, gotoSession, { hasKey: false })

  await expect(cloneDialog.locator(repoCloneNoSshKeysSelector)).toBeVisible()
  await expect(cloneDialog.locator(repoCloneSubmitSelector)).toBeDisabled()
})

test("security guidance can be expanded in key generation flow", async ({ page, gotoSession }) => {
  const cloneDialog = await openCloneDialogFromSettings(page, gotoSession, { hasKey: false })

  await cloneDialog.locator(repoCloneSecurityToggleSelector).click()
  await expect(cloneDialog.locator(repoCloneSecurityContentSelector)).toContainText("machine hosting your opencode")
  await expect(cloneDialog.locator(repoCloneSecurityContentSelector)).toContainText("Ed25519")
})
