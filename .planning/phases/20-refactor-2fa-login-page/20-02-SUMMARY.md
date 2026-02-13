---
phase: 20-refactor-2fa-login-page
plan: 02
subsystem: auth
tags: [hono, solidjs, 2fa, ui-dir]

# Dependency graph
requires:
  - phase: 20-refactor-2fa-login-page-01
    provides: SolidJS TOTP entry and totp.html build output
provides:
  - Auth route serves built totp.html with bootstrap data (with legacy 2fa fallback)
  - Removal of inline TOTP HTML template
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cached UI template loader for totp.html with legacy 2fa fallback
    - Per-request bootstrap injection for TOTP verification

key-files:
  created: []
  modified:
    - packages/opencode/src/server/routes/auth.ts

key-decisions:
  - "Serve canonical totp.html from the UI directory and inject TOTP bootstrap data per request (legacy 2fa fallback retained)."

patterns-established:
  - "Auth TOTP route mirrors login route template loading and bootstrap injection."

# Metrics
duration: 8 min
completed: 2026-01-31
---

# Phase 20 Plan 02 Summary

**/auth/login/totp now loads the built totp.html (with legacy 2fa fallback) and injects TOTP bootstrap data (legacy `/auth/login/2fa` alias retained), removing the inline template.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-31T22:32:00Z
- **Completed:** 2026-01-31T22:40:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added a cached loader for canonical `totp.html` with legacy `2fa.html` fallback using the UI directory.
- Injected `window.__OPENCODE_TOTP__` bootstrap data per request.
- Removed the string-based TOTP HTML template from auth routes.

## Task Commits

No task commits were created (commits were not requested).

## Files Created/Modified

- `packages/opencode/src/server/routes/auth.ts` - Loads `totp.html` (fallback `2fa.html`) and injects TOTP bootstrap data.

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `bun run typecheck` and `bun run build` were not executed (not requested in this session).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for manual verification of `/auth/login/totp` (or legacy `/auth/login/2fa`) in a local dev server session using canonical `totp.html`.

---

_Phase: 20-refactor-2fa-login-page_
_Completed: 2026-01-31_
