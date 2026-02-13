---
status: complete
phase: 10-two-factor-authentication
source:
  [
    10-01-SUMMARY.md,
    10-02-SUMMARY.md,
    10-03-SUMMARY.md,
    10-04-SUMMARY.md,
    10-05-SUMMARY.md,
    10-06-SUMMARY.md,
    10-07-SUMMARY.md,
    10-08-SUMMARY.md,
  ]
started: 2026-01-24T23:15:00Z
completed: 2026-01-25T08:30:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: complete
name: All tests passed
expected: N/A
awaiting: none

## Tests

### 1. TOTP Configuration Options

expected: In opencode.json, you can add auth configuration with TOTP fields (twoFactorEnabled, twoFactorTokenTimeout, deviceTrustDuration, otpRateLimitMax, otpRateLimitWindow). Opencode starts normally with or without these fields.
result: pass

### 2. TOTP Setup Wizard Access

expected: When logged in, navigate to /auth/totp/setup (legacy /auth/2fa/setup alias supported). Page shows QR code, manual secret for backup, and a verification form; manual setup command appears when fallback/manual setup is required.
result: pass

### 3. QR Code in Setup Wizard

expected: The QR code in /auth/totp/setup can be scanned by an authenticator app (Google Authenticator, Authy, etc.). The manual secret is displayed below for manual entry if scanning fails.
result: pass

### 4. Setup Verification Form

expected: After scanning QR (or completing manual fallback setup if prompted), entering a valid 6-digit OTP code in the verification form confirms setup works. Shows success or error message.
result: pass

### 5. Login with TOTP - Password Step

expected: With TOTP configured for user, login with username/password. On success, you're redirected to /auth/totp page (legacy /auth/2fa alias supported; not directly to app) showing "Enter verification code for [username]".
result: pass

### 6. TOTP Verification Page - Countdown Timer

expected: The TOTP page shows a countdown timer (default 5 minutes). Timer changes color: gray (normal), yellow (31-60s), red (<=30s). At 0, redirects to login.
result: pass

### 7. TOTP Verification Page - Auto-Submit

expected: When entering exactly 6 digits in the OTP field, the form auto-submits. Backup codes (longer) require manual submit button click.
result: pass

### 8. TOTP Verification Page - Remember Device

expected: "Remember this device" checkbox is present. When checked and OTP succeeds, subsequent logins from this device skip the TOTP step.
result: pass

### 9. Device Trust Status in Session Dropdown

expected: When logged in with device trust active, session dropdown shows "Forget this device (require TOTP)" option. When TOTP is enabled, shows "Set up TOTP" link.
result: pass

### 10. Forget This Device Action

expected: Clicking "Forget this device (require TOTP)" in dropdown removes device trust. Next login will require TOTP again. Session dropdown updates to hide the option.
result: pass

### 11. Logout All Clears Device Trust

expected: Regular logout does NOT clear device trust (allowing convenient re-login). "Logout all sessions" DOES clear device trust as a security measure. After "logout all", next login will require TOTP.
result: pass

### 12. TOTP Rate Limiting

expected: After 5 failed OTP attempts within 15 minutes (default), further attempts are blocked with rate limit error message.
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0

## Gaps

None.
