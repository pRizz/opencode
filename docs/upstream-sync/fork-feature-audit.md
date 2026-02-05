# Fork Feature Audit (Initial Inventory)

Purpose: track **all** fork deltas and keep them preserved during upstream merges. This file is the authoritative checklist for fork features and should be updated whenever fork behavior changes.

## Status
- Snapshot date: 2026-02-05
- Base comparison: `parent-dev..dev`
- Source artifacts: `docs/upstream-sync/fork-commits.log`, `docs/upstream-sync/range-diff.txt`

## A. System Authentication & Security (Core Runtime)

### A0. Server auth config loader
- Files:
  - `packages/fork-auth/src/config.ts`
  - `packages/fork-auth/src/server-auth.ts`
  - `packages/fork-auth/src/index.ts` (validateAuthConfig)
  - `packages/fork-config/src/index.ts`
  - `packages/opencode/src/config/auth.ts` (re-export)
  - `packages/opencode/src/config/config.ts` (hook usage)
  - `packages/opencode/src/config/server-auth.ts` (re-export)
- Behavior:
  - Loads auth config at server startup without Instance context.
  - Validates auth config during config parsing.
  - Extends config schema for auth/workspace/uiUrl and applies workspace defaults.

### A1. Auth broker (PAM, setuid root)
- Files:
  - `packages/fork-auth/src/auth/**`
  - `packages/fork-auth/src/routes/auth.ts`
  - `packages/opencode/src/server/routes/auth.ts` (re-export)
  - `packages/opencode-broker/**`
  - `docs/pam-config.md`
- Behavior:
  - PAM authentication via privileged broker.
  - Broker spawns user processes with UID/GID and manages PTY allocation.
- Entrypoints:
  - `packages/fork-auth/src/auth/broker-client.ts`
  - `packages/fork-auth/src/routes/auth.ts`
  - `packages/opencode/src/server/routes/pty.ts`
- Tests:
  - `packages/opencode/test/server/routes/pty-broker.test.ts`
  - `packages/opencode/test/integration/user-process.test.ts`

### A2. Session auth middleware + cookies
- Files:
  - `packages/fork-auth/src/middleware/auth.ts`
  - `packages/fork-auth/src/middleware/csrf.ts`
  - `packages/opencode/src/server/middleware/auth.ts` (re-export)
  - `packages/opencode/src/server/middleware/csrf.ts` (re-export)
- Behavior:
  - Session cookies, CSRF protection, auth-required gating.
- Tests:
  - `packages/opencode/test/server/middleware/csrf.test.ts`

### A3. 2FA/TOTP (PAM OTP)
- Files:
  - `packages/fork-auth/src/auth/totp-setup.ts`
  - `packages/fork-auth/src/auth/two-factor-token.ts`
  - `packages/fork-auth/src/routes/auth.ts`
  - `packages/opencode-broker/service/opencode-otp.pam*`
- Tests:
  - `packages/opencode/test/server/routes/auth.test.ts`

### A4. Security hardening
- Files:
  - `packages/fork-auth/src/security/https-detection.ts`
  - `packages/fork-auth/src/security/rate-limit.ts`
  - `packages/fork-security/src/index.ts`
  - `packages/opencode/src/server/security/https-detection.ts` (re-export)
  - `packages/opencode/src/server/security/rate-limit.ts` (re-export)
  - `packages/opencode/src/server/security/csrf.ts` (re-export)
  - `packages/opencode/src/server/security/token-secret.ts` (re-export)
- Behavior:
  - HTTPS detection (trust proxy), insecure login warning/block, rate limiting.
- Tests:
  - `packages/opencode/test/server/security/https-detection.test.ts`
  - `packages/opencode/test/server/security/rate-limit.test.ts`

## B. CLI & TUI Additions

### B1. Auth broker CLI commands
- Files:
  - `packages/fork-cli/src/auth-broker.ts`
  - `packages/fork-cli/src/error.ts`
  - `packages/opencode/src/cli/cmd/auth.ts` (hook registration)
  - `packages/opencode/src/cli/error.ts` (fork error hook)
- Behavior:
  - `opencode auth broker setup/status` (PAM file installation, broker status).

### B2. Web CLI local UI bundling + mDNS label override
- Files:
  - `packages/fork-cli/src/web.ts`
  - `packages/opencode/src/cli/cmd/web.ts` (hook usage)
  - `packages/opencode/src/server/server.ts` (uiDir hook usage)
  - `packages/opencode/src/server/ui-dir.ts`
- Behavior:
  - Builds and serves local web UI when needed; uses `opencode.local` for mDNS display.

### B3. CLI branding override
- Files:
  - `packages/fork-cli/src/logo.ts`
  - `packages/opencode/src/cli/ui.ts` (hook usage)
  - `packages/opencode/src/cli/logo.ts` (upstream glyphs)
- Behavior:
  - Custom fork ASCII logo in CLI.

### B4. Run command behavior
- Files:
  - `packages/fork-cli/src/run.ts`
  - `packages/opencode/src/cli/cmd/run.ts` (hook usage)
- Behavior:
  - Fork-specific run output formatting, permission prompts, and idle handling.

### B5. TUI updates for auth and permissions
- Files:
  - `packages/fork-cli/src/tui.ts`
  - `packages/opencode/src/cli/cmd/tui/worker.ts` (hook usage)
  - `packages/opencode/src/cli/cmd/tui/**`
- Behavior:
  - Auth status hints, permissions dialogs, updated UX.
  - Injects Basic auth header for internal TUI requests.

## C. UI/UX & Branding (Web/App)

### C1. Login UI + security badges
- Files:
  - `packages/fork-ui/src/login.tsx`
  - `packages/fork-ui/src/two-factor.tsx`
  - `packages/fork-ui/src/two-factor-setup.tsx`
  - `packages/app/src/login/**` (thin wrappers + HTML entrypoints)
  - `packages/app/src/pages/**`
  - `packages/app/src/components/**`
- Behavior:
  - Login forms, 2FA flow, HTTP warning UI.

### C2. App UI changes
- Files:
  - `packages/fork-ui/src/auth-gate.tsx`
  - `packages/fork-ui/src/auth-error.ts`
  - `packages/fork-ui/src/session-indicator.tsx`
  - `packages/fork-ui/src/manage-2fa-dialog.tsx`
  - `packages/fork-ui/src/session-expired-overlay.tsx`
  - `packages/fork-ui/src/security-badge.tsx`
  - `packages/fork-ui/src/security-badge-style.ts`
  - `packages/fork-ui/src/http-warning-banner.tsx`
  - `packages/fork-ui/src/session-expiration-warning.ts`
  - `packages/fork-ui/src/csrf-fetch.ts`
  - `packages/fork-ui/src/use-clone-progress.ts`
  - `packages/app/src/components/**` (thin wrappers)
  - `packages/app/src/context/**`
  - `packages/app/src/pages/**`
- Behavior:
  - Session view tweaks, terminal UI changes, dialogs.

## D. Terminal & PTY Behavior

### D1. Broker-backed PTY
- Files:
  - `packages/opencode/src/pty/index.ts`
  - `packages/opencode/src/pty/broker-pty.ts` (wrapper)
  - `packages/fork-terminal/src/broker-pty.ts`
  - `packages/fork-terminal/src/broker-pty-manager.ts`
  - `packages/fork-terminal/src/server-pty.ts`
  - `packages/fork-terminal/src/pty-auth-hook.ts`
  - `packages/opencode/src/server/routes/pty.ts`
  - `packages/fork-terminal/src/server.ts`
- Behavior:
  - Broker PTY creation for authenticated sessions.

### D2. Terminal UI + addons
- Files:
  - `packages/fork-terminal/src/terminal.tsx`
  - `packages/fork-terminal/src/sortable-terminal-tab.tsx`
  - `packages/fork-terminal/src/serialize-addon.ts`
  - `packages/fork-terminal/src/terminal-types.ts`
  - `packages/app/src/components/terminal.tsx` (wrapper)
  - `packages/app/src/components/session/session-sortable-terminal-tab.tsx` (wrapper)
  - `packages/app/src/addons/serialize.ts` (re-export)
- Behavior:
  - Terminal rendering, tab drag/drop, and buffer serialization moved into fork package with thin app wrappers.

## E. Providers & Integrations

### E0. Upstream-only items (reference)
- MCP auth enhancements (upstream; no fork-specific changes detected)
- Scheduler/automation module (upstream; no fork-specific changes detected)

### E1. OpenRouter free model support (fork-only)
- Files:
  - `packages/fork-provider/src/openrouter.ts`
  - `packages/fork-provider/src/index.ts` (provider hooks)
  - `packages/opencode/src/provider/provider.ts` (hook usage)
  - `packages/opencode/src/config/config.ts` (OpenRouter config schema via fork-provider)
- Behavior:
  - OpenRouter free router/variant augmentation and default selection.

## F. Internationalization & UI Assets

### F0. Upstream-only items (reference)
- i18n + assets (upstream; no fork-specific changes detected).

## G. Docs & Operational Guidance

- `docs/pam-config.md` (PAM configuration)
- `docs/reverse-proxy.md` and `docs/reverse-proxy/*` (TLS/reverse proxy)
- `docs/docker-install-fork.md` (fork install guidance)
- `FORK.md` (fork-specific README notes)
- README variants (localized)

## H. Tests

- Fork auth/security/PTY tests under `packages/fork-tests/**`
- App E2E smoke tests under `packages/app/e2e/**`

## I. Infra / CI / Workflows

- Workflows under `.github/workflows/**`
- Nix/flake updates: `flake.nix`, `flake.lock`, `nix/**`
- Containers: `packages/containers/**`

## J. Planning / Internal Docs
- `.planning/**`
- `specs/**`

## K. Repo & SSH Management

### K1. Repo clone and management routes
- Files:
  - `packages/fork-auth/src/routes/repo.ts`
  - `packages/opencode/src/server/routes/repo.ts` (re-export)
  - `packages/opencode/src/server/server.ts` (route wiring)
- Behavior:
  - Auth-aware repo cloning/branch management.

### K2. SSH key management routes
- Files:
  - `packages/fork-auth/src/routes/ssh-keys.ts`
  - `packages/opencode/src/server/routes/ssh-keys.ts` (re-export)
  - `packages/opencode/src/server/server.ts` (route wiring)
- Behavior:
  - Auth-aware SSH key CRUD endpoints.

## Notes
- This is an initial inventory. As decoupling progresses, move items into fork packages and update this checklist with the new home and entrypoints.
- Fork hook packages: `packages/fork-auth`, `packages/fork-ui`, `packages/fork-terminal`, `packages/fork-cli`, `packages/fork-security`, `packages/fork-provider`, `packages/fork-config`.

## Remaining Areas
- TUI decoupling (`packages/opencode/src/cli/cmd/tui/**`)
- Providers/Integrations
- Docs (content updates)
- Tests
- Infra/CI
- Planning/Spec housekeeping
