export function isSshCloneUrl(url: string) {
  const trimmed = url.trim().toLowerCase()
  return trimmed.startsWith("git@") || trimmed.startsWith("ssh://")
}

export function isHttpCloneUrl(url: string) {
  const trimmed = url.trim().toLowerCase()
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
}

export function isHttpsCloneUnsupported(url: string) {
  return isHttpCloneUrl(url)
}

export function parseSshCloneHost(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return undefined

  const normalized = trimmed.toLowerCase()
  if (normalized.startsWith("git@")) {
    const atIndex = trimmed.indexOf("@")
    if (atIndex === -1) return undefined
    const rest = trimmed.slice(atIndex + 1)
    const host = rest.split(/[/:]/)[0]?.trim().toLowerCase()
    return host || undefined
  }

  if (normalized.startsWith("ssh://")) {
    try {
      const parsed = new URL(trimmed)
      const host = parsed.hostname.trim().toLowerCase()
      return host || undefined
    } catch {
      return undefined
    }
  }

  return undefined
}
