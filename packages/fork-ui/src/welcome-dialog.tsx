import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ForkPointerLink } from "./fork-pointer-link"

export function WelcomeDialog() {
  const dialog = useDialog()

  return (
    <Dialog title="Welcome to OpenCode Cloud" size="large" fit class="max-w-[760px]">
      <div class="flex flex-col gap-5 px-2 pb-3" data-action="welcome-modal">
        <p class="text-14-regular text-text-base">
          OpenCode Cloud is ready. Start by opening or cloning a repository, then launch a session and prompt the
          assistant from your project context.
        </p>

        <div class="rounded-md border border-border-weak-base p-4">
          <div class="text-13-medium text-text-strong">Quick start</div>
          <ul class="mt-2 list-disc pl-5 text-12-regular text-text-weak">
            <li>Open a local project or clone via SSH from the home screen.</li>
            <li>Create a new session and describe the task you want help with.</li>
            <li>Use Settings to tune models, shortcuts, and repository access.</li>
          </ul>
        </div>

        <div class="rounded-md border border-border-weak-base p-4" data-action="welcome-fork-features">
          <div class="text-13-medium text-text-strong">What this fork adds</div>
          <ul class="mt-2 list-disc pl-5 text-12-regular text-text-weak">
            <li>Passkey-first authentication with password and TOTP fallback options.</li>
            <li>Built-in session and device security controls with passkey/2FA management.</li>
            <li>Repository workflow UX for cloning/managing repos and handling SSH keys in the web app.</li>
            <li>Cloud-oriented security UX, including HTTP safety warnings and session-expiry handling.</li>
          </ul>
        </div>

        <div class="rounded-md border border-border-weak-base p-4">
          <div class="text-13-medium text-text-strong">Learn more</div>
          <ul class="mt-2 list-disc pl-5 text-12-regular text-text-weak">
            <li>
              <ForkPointerLink href="https://github.com/pRizz/opencode-cloud" class="underline">
                Repository root
              </ForkPointerLink>
            </li>
            <li>
              <ForkPointerLink href="https://github.com/pRizz/opencode-cloud/blob/main/README.md" class="underline">
                README
              </ForkPointerLink>
            </li>
            <li>
              <ForkPointerLink href="https://github.com/pRizz/opencode-cloud/tree/main/docs" class="underline">
                Docs folder
              </ForkPointerLink>
            </li>
            <li>
              <ForkPointerLink
                href="https://github.com/pRizz/opencode"
                class="underline"
                data-action="welcome-link-opencode-fork"
              >
                Our opencode fork
              </ForkPointerLink>
            </li>
            <li>
              <ForkPointerLink href="https://github.com/pRizz/opencode-cloud/issues" class="underline">
                Issues
              </ForkPointerLink>
            </li>
          </ul>
        </div>

        <div class="flex justify-end pt-1">
          <Button onClick={() => dialog.close()}>Get started</Button>
        </div>
      </div>
    </Dialog>
  )
}
