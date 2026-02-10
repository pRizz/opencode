const WELCOME_KEY = "opencode.fork.dat:welcome.v1"
const WELCOME_SEEN = "seen"

function read() {
  try {
    return localStorage.getItem(WELCOME_KEY)
  } catch {
    return undefined
  }
}

export function hasSeenWelcome() {
  return read() === WELCOME_SEEN
}

export function markWelcomeSeen() {
  try {
    localStorage.setItem(WELCOME_KEY, WELCOME_SEEN)
  } catch {
    return
  }
}

