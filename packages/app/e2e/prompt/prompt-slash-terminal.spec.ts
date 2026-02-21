import { test, expect } from "../fixtures"
import { promptSelector, terminalSelector } from "../selectors"

test("/terminal toggles the terminal panel", async ({ page, gotoSession }) => {
  await gotoSession()

  const prompt = page.locator(promptSelector)
  const terminal = page.locator(terminalSelector)
  const terminalToggleSlash = page.locator('[data-slash-id="terminal.toggle"]').first()
  const terminalInput = page.locator('[data-component="terminal"] textarea').first()

  await expect(terminal).not.toBeVisible()

  await prompt.click()
  await expect(prompt).toBeFocused()
  await page.keyboard.type("/terminal")
  await expect(terminalToggleSlash).toBeVisible()
  await prompt.press("Enter")
  await expect(terminal).toBeVisible()
  await expect(terminalInput).toBeFocused()

  await prompt.click()
  await expect(prompt).toBeFocused()
  await page.keyboard.type("/terminal")
  await expect(terminalToggleSlash).toBeVisible()
  await prompt.press("Enter")
  await expect(terminal).not.toBeVisible()
})
