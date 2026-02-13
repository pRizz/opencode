---
phase: 22-refactor-the-auth-2fa-setup-page-from-the-auth-ts-into-the-solidjs-app-at-packages-app
plan: 02
subsystem: auth
tags: [hono, solidjs, 2fa, setup, ui-dir]

# Dependency graph
requires:
  - phase: 22-refactor-the-auth-2fa-setup-page-from-the-auth-ts-into-the-solidjs-app-at-packages-app-01
    provides: SolidJS setup entry and totp-setup.html build output
provides:
  - Auth route serves built totp-setup.html with bootstrap data (with legacy 2fa-setup fallback)
  - Removal of inline TOTP setup HTML template
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cached UI template loader for totp-setup.html with legacy 2fa-setup fallback
    - Per-request bootstrap injection for TOTP setup data

key-files:
  created: []
  modified:
    - packages/opencode/src/server/routes/auth.ts

key-decisions:
  - "Serve canonical totp-setup.html from the UI directory and inject setup bootstrap data per request (legacy 2fa-setup fallback retained)."

patterns-established:
  - "Auth TOTP setup route mirrors login/TOTP template loading and bootstrap injection."

# Metrics
duration: 8 min
completed: 2026-02-01
---

# Phase 22 Plan 02 Summary

**/auth/totp/setup now loads the built totp-setup.html (with legacy 2fa-setup fallback) and injects setup bootstrap data (legacy `/auth/2fa/setup` alias retained), removing the inline template.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-01T09:54:00Z
- **Completed:** 2026-02-01T10:02:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added a cached loader for canonical `totp-setup.html` with legacy `2fa-setup.html` fallback using the UI directory.
- Injected `window.__OPENCODE_TOTP_SETUP__` bootstrap data per request.
- Removed the string-based TOTP setup HTML template from auth routes.

## Task Commits

No task commits were created (commits were not requested).

## Files Created/Modified

- `packages/opencode/src/server/routes/auth.ts` - Loads `totp-setup.html` (fallback `2fa-setup.html`) and injects setup bootstrap data.

## Decisions Made

None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `bun run typecheck` and `bun run build` were not executed (not requested in this session).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for manual verification of `/auth/totp/setup` (or legacy `/auth/2fa/setup`) in a local dev server session using canonical `totp-setup.html`.

---

_Phase: 22-refactor-the-auth-2fa-setup-page-from-the-auth-ts-into-the-solidjs-app-at-packages-app_
_Completed: 2026-02-01_
