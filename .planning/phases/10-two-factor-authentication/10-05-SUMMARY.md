---
phase: 10-two-factor-authentication
plan: 05
subsystem: auth
tags: [jwt, totp, device-trust, hono]

# Dependency graph
requires:
  - phase: 10-03
    provides: JWT token utilities (totp-token.ts with legacy create2FAToken/verify2FAToken aliases, and device-trust.ts)
  - phase: 10-04
    provides: BrokerClient TOTP methods (checkTotp, authenticateOtp)
provides:
  - Server token secret module for JWT signing
  - TOTP-aware login flow with device trust bypass
  - POST /auth/login/totp endpoint for OTP validation (legacy /auth/login/2fa alias retained)
  - Device trust cookie setting on successful TOTP
affects: [10-06, login-ui-2fa, session-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server-wide signing secret via lazy initialization
    - Two-step auth flow with intermediate JWT token
    - Device trust via httpOnly secure cookies

key-files:
  created:
    - packages/opencode/src/server/security/token-secret.ts
  modified:
    - packages/opencode/src/server/routes/auth.ts

key-decisions:
  - "Token secret generated once at startup and kept in-memory"
  - "TOTP token bound to requesting IP for security"
  - "Device trust cookie set with Strict SameSite"
  - "TOTP login does not use rememberMe for session (device trust is separate)"

patterns-established:
  - "Token secret via lazy initialization: getTokenSecret() for all JWT operations"
  - "Two-step auth: password success returns TOTP-required response with JWT, then OTP validates"
  - "Device trust bypass: verify cookie before requiring TOTP"

# Metrics
duration: 3min
completed: 2026-01-24
---

# Phase 10 Plan 05: Auth Routes TOTP Flow Summary

**TOTP-aware login endpoint with device trust bypass and canonical /login/totp OTP validation endpoint (legacy /login/2fa alias retained)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-24T22:48:20Z
- **Completed:** 2026-01-24T22:50:56Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Server token secret module for JWT signing across all TOTP operations
- Login endpoint extended to check TOTP and return TOTP-required response
- Device trust cookie verification to bypass TOTP on trusted devices
- POST /auth/login/totp endpoint for OTP validation with device trust setting (legacy /auth/login/2fa alias retained)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create server token secret module** - `cc057c3b9` (feat)
2. **Task 2: Modify login endpoint for TOTP flow** - `2550e6a1d` (feat)
3. **Task 3: Add POST /auth/login/totp endpoint** - `398119b61` (feat, legacy /auth/login/2fa alias retained)

## Files Created/Modified

- `packages/opencode/src/server/security/token-secret.ts` - Server-wide JWT signing secret
- `packages/opencode/src/server/routes/auth.ts` - TOTP-aware login flow and canonical /login/totp endpoint (legacy /login/2fa alias retained)

## Decisions Made

- Token secret generated once at startup via lazy initialization (acceptable that tokens invalidate on restart, matching session design)
- TOTP token bound to requesting IP for security
- Device trust cookie uses httpOnly, Strict SameSite, secure on HTTPS
- TOTP login does not use rememberMe for session (device trust is a separate concept)
- Rate limiter shared between password auth and OTP validation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server-side TOTP flow complete
- Ready for TOTP UI implementation (Plan 06)
- All endpoints verified via TypeScript compilation

---

_Phase: 10-two-factor-authentication_
_Completed: 2026-01-24_
