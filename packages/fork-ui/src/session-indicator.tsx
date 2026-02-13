import { createEffect, createSignal, Show } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ManageTotpDialog } from "./manage-2fa-dialog"
import { PasskeyManagerDialog } from "./passkey-manager-dialog"
import { authForgetDevice, authLogout, authLogoutAll } from "./settings-auth-actions"

interface SessionIndicatorSession {
  isAuthenticated: () => boolean
  username: () => string | undefined
}

interface SessionIndicatorProps {
  session: SessionIndicatorSession
  getServerUrl: () => string | undefined
}

/**
 * Device trust status from the server.
 */
interface DeviceTrustStatus {
  twoFactorEnabled: boolean
  twoFactorConfigured: boolean
  twoFactorOptedOut: boolean
  deviceTrusted: boolean
}

/**
 * Session indicator component that shows the logged-in username
 * with a dropdown menu for logout.
 *
 * Only renders when user is authenticated.
 */
export function SessionIndicator(props: SessionIndicatorProps) {
  const session = props.session
  const dialog = useDialog()
  const [deviceTrustStatus, setDeviceTrustStatus] = createSignal<DeviceTrustStatus | null>(null)
  const displayUsername = () => session.username() ?? ""

  // Fetch device trust status on mount
  const fetchDeviceTrustStatus = async () => {
    if (!session.isAuthenticated()) return

    const url = props.getServerUrl()
    if (!url) return

    try {
      const res = await fetch(`${url}/auth/device-trust/status`, {
        credentials: "include",
      })
      const data = (await res.json()) as DeviceTrustStatus
      setDeviceTrustStatus(data)
    } catch {
      // Silently fail - device trust features will just not show
      setDeviceTrustStatus(null)
    }
  }

  createEffect(() => {
    void fetchDeviceTrustStatus()
  })

  /**
   * Handle logout by POSTing to /auth/logout endpoint.
   */
  async function handleLogout(): Promise<void> {
    await authLogout({ getServerUrl: props.getServerUrl })
  }

  /**
   * Handle logout all sessions by POSTing to /auth/logout/all endpoint.
   * This also clears device trust as a security measure.
   */
  async function handleLogoutAll(): Promise<void> {
    await authLogoutAll({ getServerUrl: props.getServerUrl })
  }

  /**
   * Revoke device trust, requiring TOTP on next login.
   */
  async function handleForgetDevice(): Promise<void> {
    const ok = await authForgetDevice({ getServerUrl: props.getServerUrl })
    if (ok) {
      // Update local state to reflect that device is no longer trusted.
      setDeviceTrustStatus((prev) => (prev ? { ...prev, deviceTrusted: false } : null))
    }
  }

  /**
   * Navigate to TOTP setup page.
   */
  function handleSetupTotp(): void {
    const url = props.getServerUrl()
    if (!url) return
    // Open TOTP setup in new tab (could be external documentation or setup page)
    window.open(`${url}/auth/2fa/setup`, "_blank")
  }

  function handleManageTotp(): void {
    dialog.show(() => <ManageTotpDialog onUpdate={fetchDeviceTrustStatus} getServerUrl={props.getServerUrl} />)
  }

  function handleManagePasskeys(): void {
    dialog.show(() => <PasskeyManagerDialog onUpdate={fetchDeviceTrustStatus} getServerUrl={props.getServerUrl} />)
  }

  const showDeviceTrustOptions = () => {
    const status = deviceTrustStatus()
    return status && status.twoFactorEnabled
  }

  const isTwoFactorConfigured = () => deviceTrustStatus()?.twoFactorConfigured ?? false
  const isTwoFactorOptedOut = () => deviceTrustStatus()?.twoFactorOptedOut ?? false

  const isDeviceTrusted = () => {
    const status = deviceTrustStatus()
    return status?.deviceTrusted ?? false
  }

  return (
    <Show when={session.isAuthenticated()}>
      <DropdownMenu>
        <DropdownMenu.Trigger
          as={Button}
          variant="ghost"
          size="small"
          class="text-text-base hover:bg-surface-base-active flex items-center gap-1"
          data-action="settings-authentication-menu-trigger"
        >
          {displayUsername()}
          <Icon name="chevron-down" size="small" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="mt-1">
            <DropdownMenu.Group>
              <DropdownMenu.GroupLabel class="text-text-muted px-2 py-1.5 text-xs">
                {displayUsername()}
              </DropdownMenu.GroupLabel>
            </DropdownMenu.Group>
            <Show when={showDeviceTrustOptions()}>
              <DropdownMenu.Separator />
              <Show when={isDeviceTrusted()}>
                <DropdownMenu.Item
                  onSelect={handleForgetDevice}
                  data-action="settings-authentication-menu-forget-device"
                >
                  <DropdownMenu.ItemLabel>Forget this device (require TOTP)</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </Show>
              <DropdownMenu.Item
                onSelect={isTwoFactorConfigured() ? handleManageTotp : handleSetupTotp}
                data-action="settings-authentication-menu-totp"
              >
                <DropdownMenu.ItemLabel>
                  {isTwoFactorConfigured() ? "Manage TOTP" : isTwoFactorOptedOut() ? "Enable TOTP" : "Set up TOTP"}
                </DropdownMenu.ItemLabel>
              </DropdownMenu.Item>
            </Show>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={handleManagePasskeys} data-action="settings-authentication-menu-passkeys">
              <DropdownMenu.ItemLabel>Manage passkeys</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={handleLogout} data-action="settings-authentication-menu-logout">
              <DropdownMenu.ItemLabel>Log out</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={handleLogoutAll} data-action="settings-authentication-menu-logout-all">
              <DropdownMenu.ItemLabel>Log out all sessions</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </Show>
  )
}
