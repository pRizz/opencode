# Fork Feature Audit (Initial Inventory)

Purpose: track **all** fork deltas and keep them preserved during upstream merges. This file is the authoritative checklist for fork features and should be updated whenever fork behavior changes.

## Status
- Snapshot date: 2026-02-05
- Base comparison: `parent-dev..dev`
- Source artifacts: `docs/upstream-sync/fork-commits.log`, `docs/upstream-sync/range-diff.txt`

## A. System Authentication & Security (Core Runtime)

### A1. Auth broker (PAM, setuid root)
- Files:
  - `packages/fork-auth/src/auth/**`
  - `packages/fork-auth/src/routes/auth.ts`
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
- Behavior:
  - HTTPS detection (trust proxy), insecure login warning/block, rate limiting.
- Tests:
  - `packages/opencode/test/server/security/https-detection.test.ts`
  - `packages/opencode/test/server/security/rate-limit.test.ts`

## B. CLI & TUI Additions

### B1. Auth broker CLI commands
- Files:
  - `packages/opencode/src/cli/cmd/auth.ts`
  - `packages/opencode/src/cli/error.ts`
- Behavior:
  - `opencode auth broker setup/status` (PAM file installation, broker status).

### B2. TUI updates for auth and permissions
- Files:
  - `packages/opencode/src/cli/cmd/tui/**`
- Behavior:
  - Auth status hints, permissions dialogs, updated UX.

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
  - `packages/app/src/components/**`
  - `packages/app/src/context/**`
  - `packages/app/src/pages/**`
- Behavior:
  - Session view tweaks, terminal UI changes, dialogs.

## D. Terminal & PTY Behavior

### D1. Broker-backed PTY
- Files:
  - `packages/opencode/src/pty/**`
  - `packages/opencode/src/server/routes/pty.ts`
- Behavior:
  - Broker PTY creation for authenticated sessions.

## E. Providers & Integrations

### E1. Copilot/OpenAI-compatible provider support
- Files:
  - `packages/opencode/src/provider/sdk/copilot/**`
  - `packages/opencode/src/provider/transform.ts`
- Behavior:
  - Copilot provider integration and OpenAI-compatible response handling.

### E2. MCP auth enhancements
- Files:
  - `packages/opencode/src/cli/cmd/mcp.ts`
  - `packages/opencode/src/mcp/**`
- Behavior:
  - OAuth-capable MCP server auth flows and status display.

### E3. Scheduler/automation module
- Files:
  - `packages/opencode/src/scheduler/**`
- Behavior:
  - Scheduler module used for planned automation features.

## F. Internationalization & UI Assets

### F1. App/UI/desktop i18n
- Files:
  - `packages/app/src/i18n/**`
  - `packages/ui/src/i18n/**`
  - `packages/desktop/src/i18n/**`
- Behavior:
  - Localized strings and language switching support.

### F2. Audio/fonts/theme assets
- Files:
  - `packages/ui/src/assets/audio/**`
  - `packages/ui/src/assets/fonts/**`
  - `packages/ui/src/assets/favicon/**`
  - `packages/ui/src/theme/**`
- Behavior:
  - UI sound cues, bundled fonts, theme definitions, and favicon assets.

## G. Docs & Operational Guidance

- `docs/pam-config.md` (PAM configuration)
- `docs/reverse-proxy.md` and `docs/reverse-proxy/*` (TLS/reverse proxy)
- `docs/docker-install-fork.md` (fork install guidance)
- README variants (localized)

## H. Tests

- Auth/security/PTY tests under `packages/opencode/test/**`
- App E2E smoke tests under `packages/app/e2e/**`

## I. Infra / CI / Workflows

- Workflows under `.github/workflows/**`
- Nix/flake updates: `flake.nix`, `flake.lock`, `nix/**`
- Containers: `packages/containers/**`

## J. Planning / Internal Docs

- `.planning/**`
- `specs/**`

## Notes
- This is an initial inventory. As decoupling progresses, move items into fork packages and update this checklist with the new home and entrypoints.
- Fork hook packages: `packages/fork-auth`, `packages/fork-ui`, `packages/fork-terminal`, `packages/fork-cli`, `packages/fork-security`.
