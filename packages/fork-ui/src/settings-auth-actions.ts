interface SettingsAuthActionProps {
  getServerUrl: () => string | undefined
}

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/opencode_csrf=([^;]+)/)
  return match ? match[1] : undefined
}

function actionHeaders() {
  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
  }
  const token = getCsrfToken()
  if (token) {
    headers["X-CSRF-Token"] = token
  }
  return headers
}

function actionUrl(props: SettingsAuthActionProps, path: string) {
  const base = props.getServerUrl()
  if (!base) return undefined
  return `${base}${path}`
}

async function actionPost(props: SettingsAuthActionProps, path: string) {
  const url = actionUrl(props, path)
  if (!url) return undefined

  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: actionHeaders(),
  }).catch(() => undefined)
}

export async function authLogout(props: SettingsAuthActionProps) {
  const res = await actionPost(props, "/auth/logout")
  if (!res) return false

  if (res.ok || res.status === 302) {
    const url = actionUrl(props, "/auth/login")
    if (url) {
      window.location.href = url
    }
  }

  return res.ok || res.status === 302
}

export async function authLogoutAll(props: SettingsAuthActionProps) {
  const res = await actionPost(props, "/auth/logout/all")
  if (!res) return false

  if (res.ok || res.status === 302) {
    const url = actionUrl(props, "/auth/login")
    if (url) {
      window.location.href = url
    }
  }

  return res.ok || res.status === 302
}

export async function authForgetDevice(props: SettingsAuthActionProps) {
  const res = await actionPost(props, "/auth/device-trust/revoke")
  return Boolean(res?.ok)
}
