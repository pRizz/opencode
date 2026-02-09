import { test, expect } from "../fixtures"
import { openSidebar, withSession } from "../actions"
import { promptSelector } from "../selectors"

// Skip: sidebar session list doesn't render in our git submodule environment because
// git rev-parse --git-common-dir resolves to .git/modules/... which causes a worktree path
// mismatch between the URL directory and the sidebar's project directory.
test.skip("titlebar back/forward navigates between sessions", async ({ page, slug, sdk, gotoSession }) => {
  await page.setViewportSize({ width: 1400, height: 800 })

  const stamp = Date.now()

  await withSession(sdk, `e2e titlebar history 1 ${stamp}`, async (one) => {
    await withSession(sdk, `e2e titlebar history 2 ${stamp}`, async (two) => {
      await gotoSession(one.id)

      await openSidebar(page)

      const link = page.locator(`[data-session-id="${two.id}"] a`).first()
      await expect(link).toBeVisible({ timeout: 15_000 })
      await link.scrollIntoViewIfNeeded()
      await link.click()

      await expect(page).toHaveURL(new RegExp(`/${slug}/session/${two.id}(?:\\?|#|$)`))
      await expect(page.locator(promptSelector)).toBeVisible()

      const back = page.getByRole("button", { name: "Back" })
      const forward = page.getByRole("button", { name: "Forward" })

      await expect(back).toBeVisible()
      await expect(back).toBeEnabled()
      await back.click()

      await expect(page).toHaveURL(new RegExp(`/${slug}/session/${one.id}(?:\\?|#|$)`))
      await expect(page.locator(promptSelector)).toBeVisible()

      await expect(forward).toBeVisible()
      await expect(forward).toBeEnabled()
      await forward.click()

      await expect(page).toHaveURL(new RegExp(`/${slug}/session/${two.id}(?:\\?|#|$)`))
      await expect(page.locator(promptSelector)).toBeVisible()
    })
  })
})
