export const BOOTSTRAP_PASSWORD_MIN_LENGTH = 12

export const PASSWORD_POLICY_MESSAGE =
  "Use at least 12 characters and include at least 3 of these: uppercase, lowercase, number, symbol."

const USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/

export interface PasswordPolicyResult {
  valid: boolean
  errors: string[]
}

export function validateBootstrapPassword(password: string): PasswordPolicyResult {
  const errors: string[] = []

  if (password.length < BOOTSTRAP_PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${BOOTSTRAP_PASSWORD_MIN_LENGTH} characters.`)
  }

  let classes = 0
  if (/[A-Z]/.test(password)) classes += 1
  if (/[a-z]/.test(password)) classes += 1
  if (/[0-9]/.test(password)) classes += 1
  if (/[^A-Za-z0-9]/.test(password)) classes += 1

  if (classes < 3) {
    errors.push("Password must include at least 3 of 4 classes: uppercase, lowercase, number, symbol.")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateBootstrapUsername(username: string): PasswordPolicyResult {
  const errors: string[] = []

  if (!USERNAME_PATTERN.test(username)) {
    errors.push("Username must match ^[a-z_][a-z0-9_-]{0,31}$.")
  }

  if (username === "opencoder") {
    errors.push("Username 'opencoder' is reserved.")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
