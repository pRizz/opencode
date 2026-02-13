import { createContext, createEffect, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"

interface SessionInfo {
  username?: string
}

interface AuthStatus {
  passkeysEnabled?: boolean
}

interface DeviceTrustResponse {
  twoFactorEnabled: boolean
  twoFactorConfigured: boolean
  twoFactorOptedOut: boolean
  deviceTrusted: boolean
}

interface SettingsAuthProviderProps extends ParentProps {
  getServerUrl: () => string | undefined
}

interface SettingsAuthValue {
  getServerUrl: () => string | undefined
  state: {
    checked: boolean
    loading: boolean
    authenticated: boolean
    username: string | undefined
    passkeysEnabled: boolean
    totpEnabled: boolean
    totpConfigured: boolean
    totpOptedOut: boolean
    /** @deprecated Prefer `totpEnabled`. */
    twoFactorEnabled: boolean
    /** @deprecated Prefer `totpConfigured`. */
    twoFactorConfigured: boolean
    /** @deprecated Prefer `totpOptedOut`. */
    twoFactorOptedOut: boolean
    deviceTrusted: boolean
    error: string | undefined
  }
  refresh: () => Promise<void>
  refreshSession: () => Promise<void>
  refreshDeviceTrust: () => Promise<void>
}

const SettingsAuthContext = createContext<SettingsAuthValue>()

function createSettingsAuthValue(getServerUrl: () => string | undefined): SettingsAuthValue {
  const [state, setState] = createStore({
    checked: false,
    loading: false,
    authenticated: false,
    username: undefined as string | undefined,
    passkeysEnabled: false,
    totpEnabled: false,
    totpConfigured: false,
    totpOptedOut: false,
    twoFactorEnabled: false,
    twoFactorConfigured: false,
    twoFactorOptedOut: false,
    deviceTrusted: false,
    error: undefined as string | undefined,
  })

  const clearAuthState = () => {
    setState({
      authenticated: false,
      username: undefined,
      totpEnabled: false,
      totpConfigured: false,
      totpOptedOut: false,
      twoFactorEnabled: false,
      twoFactorConfigured: false,
      twoFactorOptedOut: false,
      deviceTrusted: false,
    })
  }

  const refreshSession = async () => {
    const base = getServerUrl()
    if (!base) {
      clearAuthState()
      setState("checked", true)
      return
    }

    const res = await fetch(`${base}/auth/session`, {
      credentials: "include",
    }).catch(() => undefined)

    if (!res?.ok) {
      clearAuthState()
      setState("checked", true)
      return
    }

    const body = (await res.json().catch(() => ({}))) as SessionInfo
    const username = typeof body.username === "string" ? body.username : undefined
    setState({
      checked: true,
      authenticated: Boolean(username),
      username,
    })
  }

  const refreshDeviceTrust = async () => {
    if (!state.authenticated) {
      setState({
        totpEnabled: false,
        totpConfigured: false,
        totpOptedOut: false,
        twoFactorEnabled: false,
        twoFactorConfigured: false,
        twoFactorOptedOut: false,
        deviceTrusted: false,
      })
      return
    }

    const base = getServerUrl()
    if (!base) return

    const statusRes = await fetch(`${base}/auth/status`, {
      credentials: "include",
    }).catch(() => undefined)

    const statusBody = (await statusRes?.json().catch(() => ({}))) as AuthStatus
    setState("passkeysEnabled", statusRes?.ok ? Boolean(statusBody.passkeysEnabled) : false)

    const trustRes = await fetch(`${base}/auth/device-trust/status`, {
      credentials: "include",
    }).catch(() => undefined)

    if (!trustRes?.ok) {
      setState({
        totpEnabled: false,
        totpConfigured: false,
        totpOptedOut: false,
        twoFactorEnabled: false,
        twoFactorConfigured: false,
        twoFactorOptedOut: false,
        deviceTrusted: false,
      })
      return
    }

    const trustBody = (await trustRes.json().catch(() => ({}))) as Partial<DeviceTrustResponse>
    const totpEnabled = Boolean(trustBody.twoFactorEnabled)
    const totpConfigured = Boolean(trustBody.twoFactorConfigured)
    const totpOptedOut = Boolean(trustBody.twoFactorOptedOut)
    setState({
      totpEnabled,
      totpConfigured,
      totpOptedOut,
      twoFactorEnabled: totpEnabled,
      twoFactorConfigured: totpConfigured,
      twoFactorOptedOut: totpOptedOut,
      deviceTrusted: Boolean(trustBody.deviceTrusted),
    })
  }

  const refresh = async () => {
    setState({ loading: true, error: undefined })
    await refreshSession()
    await refreshDeviceTrust()
    setState("loading", false)
  }

  createEffect(() => {
    getServerUrl()
    void refresh()
  })

  return {
    getServerUrl,
    state,
    refresh,
    refreshSession,
    refreshDeviceTrust,
  }
}

export function SettingsAuthProvider(props: SettingsAuthProviderProps) {
  const value = createSettingsAuthValue(props.getServerUrl)
  return <SettingsAuthContext.Provider value={value}>{props.children}</SettingsAuthContext.Provider>
}

export function useSettingsAuth() {
  const value = useContext(SettingsAuthContext)
  if (!value) {
    throw new Error("useSettingsAuth must be used inside SettingsAuthProvider")
  }
  return value
}
