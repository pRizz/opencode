const EPOCH_KEY = "opencode.epoch"
const PREFIX = "opencode."

export function checkEpoch(epoch: string): boolean {
  const stored = localStorage.getItem(EPOCH_KEY)
  if (stored === epoch) return false
  // First time seeing the epoch feature (upgrade from older version).
  // Adopt the server's epoch as baseline without clearing — no data was lost.
  if (!stored) {
    localStorage.setItem(EPOCH_KEY, epoch)
    return false
  }

  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(PREFIX)) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)

  // Also clear sessionStorage (e.g. CSRF tokens) that may reference the old instance.
  const session: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key?.startsWith(PREFIX)) session.push(key)
  }
  for (const key of session) sessionStorage.removeItem(key)

  localStorage.setItem(EPOCH_KEY, epoch)
  return true
}
