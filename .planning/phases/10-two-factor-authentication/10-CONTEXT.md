# Phase 10: TOTP Authentication - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can optionally enable TOTP-based authentication for login. TOTP authentication is configured via pam_google_authenticator (standard TOTP, works with Apple Passwords, Google Authenticator, etc.). When enabled, users are prompted for a verification code after password validation. Includes "remember this device" functionality and a setup wizard.

</domain>

<decisions>
## Implementation Decisions

### TOTP Flow UX

- Separate screen for TOTP entry (redirect after password success, not inline)
- Show username on TOTP screen ("Enter code for [username]")
- Single text field for 6-digit code (not 6 individual digit boxes)
- Auto-submit when 6 digits are entered
- "Remember this device" checkbox with configurable expiration
- Device trust stored in secure cookie
- Users can revoke trusted devices from session indicator dropdown

### PAM Integration

- Target pam_google_authenticator module (standard TOTP)
- Two-step process: password validation first, OTP validation second
- Broker returns a TOTP-required status after password success (canonical code with legacy alias compatibility)
- Broker returns short-lived TOTP token after password success
- Client sends TOTP token + OTP for step 2 (not password again)
- Configurable OTP window timeout, default 5 minutes
- Claude's discretion: How broker detects if user has TOTP configured

### Error Handling

- Specific error messages: "Code expired", "Invalid code", "Already used"
- Rate limiting: 5 OTP attempts per 15 minutes (same as password)
- When TOTP token expires: redirect to login (must re-enter password)
- Visual countdown timer showing remaining time for TOTP token

### Recovery Options

- Backup codes supported via pam_google_authenticator scratch codes
- UI shows hint that backup codes are accepted
- Admin recovery: document that removing ~/.google_authenticator resets TOTP authentication
- Setup wizard in UI for QR code and initial configuration

### Configuration

- New config values needed for TOTP feature
- Remember-device duration is configurable
- OTP window timeout is configurable

### Claude's Discretion

- Detection method for whether user has TOTP configured
- Exact layout/styling of TOTP page (consistent with login page)
- Setup wizard implementation details
- TOTP token generation/storage approach

</decisions>

<specifics>
## Specific Ideas

- Uses standard TOTP (RFC 6238) — compatible with Apple Passwords, Google Authenticator, Authy, 1Password, etc.
- pam_google_authenticator is the target PAM module
- Auto-submit on 6 digits for faster login flow
- Countdown timer reduces anxiety about timeout

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 10-two-factor-authentication_
_Context gathered: 2026-01-24_
