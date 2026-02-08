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
