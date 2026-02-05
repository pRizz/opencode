# OpenCode Fork Notes

## Fork Defaults

This fork runs with approvals disabled by default (equivalent to `permission: "allow"`). If you want prompts back, set `permission` rules to `ask` in your config.

## Deployment Guides

For deployment with authentication, see the fork deployment guides in `docs/`.

## SSH Key Manager

OpenCode includes an SSH key manager in Settings to help with git operations.

- Keys are stored on the server and installed to the server user's `~/.ssh/opencode` directory.
- The manager also updates the server user's `~/.ssh/config` with an OpenCode-managed block.
- Git operations started by the server will use these keys.
- If you run the server under a service account, make sure that account owns its home directory and can create `~/.ssh`.
