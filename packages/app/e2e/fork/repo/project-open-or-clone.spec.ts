import { test, expect } from "../../fixtures"
import { defocus, openSidebar } from "../../actions"
import { modKey } from "../../utils"
import { mockAuthenticatedAuth } from "../mocks/auth"
import { projectOpenCloneActionSelector } from "../selectors"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("opencode.fork.dat:welcome.v1", "seen"))
  await mockAuthenticatedAuth(page)
})

async function openProjectDialogFromSidebar(page: Parameters<typeof openSidebar>[0]) {
  await openSidebar(page)
  const openButton = page.getByRole("button", { name: "Open or clone project" }).first()
  await expect(openButton).toBeVisible()
  await openButton.click()

  const dialog = page.getByRole("dialog").filter({ hasText: "Open or clone project" }).first()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator(projectOpenCloneActionSelector)).toBeVisible()
  return dialog
}

test("sidebar project add opens the open-or-clone dialog", async ({ page, gotoSession }) => {
  await gotoSession()
  await openProjectDialogFromSidebar(page)
})

test("project.open keybind opens the open-or-clone dialog", async ({ page, gotoSession }) => {
  await gotoSession()
  await defocus(page)
  await page.keyboard.press(`${modKey}+O`)

  const dialog = page.getByRole("dialog").filter({ hasText: "Open or clone project" }).first()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator(projectOpenCloneActionSelector)).toBeVisible()
})

test("open-or-clone dialog clone action opens clone dialog", async ({ page, gotoSession }) => {
  await gotoSession()
  const projectDialog = await openProjectDialogFromSidebar(page)
  await projectDialog.locator(projectOpenCloneActionSelector).click()

  const cloneDialog = page.getByRole("dialog").filter({ hasText: "Clone from URL" }).first()
  await expect(cloneDialog).toBeVisible()
  await expect(cloneDialog.getByLabel("Repository URL")).toBeVisible()
})

test("home keeps the existing open project label", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Open project" }).first()).toBeVisible()
})
