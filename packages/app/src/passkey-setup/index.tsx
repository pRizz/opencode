// @refresh reload
import { render } from "solid-js/web"
import { PasskeySetupApp } from "./setup"
import "@/index.css"

const root = document.getElementById("root")
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your passkey-setup.html? Or maybe the id attribute got misspelled?",
  )
}

render(() => <PasskeySetupApp />, root!)
