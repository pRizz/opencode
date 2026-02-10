import { createEffect } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { WelcomeDialog } from "./welcome-dialog"
import { hasSeenWelcome, markWelcomeSeen } from "./welcome-state"

export function WelcomeBootstrap() {
  const dialog = useDialog()

  createEffect(() => {
    if (typeof window === "undefined") return
    if (window.location.pathname !== "/") return
    if (hasSeenWelcome()) return

    markWelcomeSeen()
    dialog.show(() => <WelcomeDialog />)
  })

  return null
}

