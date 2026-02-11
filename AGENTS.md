- To test opencode in `packages/opencode`, run `bun dev`.
- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`. Always run this after modifying server routes or schemas. Never manually edit generated files under `packages/sdk/js/src/gen/` or `packages/sdk/js/src/v2/gen/`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- When pushing, default to `dev` unless otherwise specified.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.

## Bun Lockfile Updates

`bun.lock` file updates are expected across all `bun.lock` files in this repository when changing versions of our own packages and can also occur during normal build/check flows.

When these `bun.lock` changes are tied to intended package/version updates, they are valid and should be committed with the related change.

## Git Hooks

This repo uses [Husky 9](https://typicode.github.io/husky/) for git hooks (wired automatically by `bun install` via the `"prepare"` script):

- **pre-push** — Validates Bun version matches `package.json`, then runs `bun typecheck`.
- **post-merge** — After every `git pull`, automatically runs `bun install` to pick up dependency changes. No manual action needed.

## Fork Isolation

This is a fork with `fork-*` packages under `packages/`. To minimize upstream merge conflicts:

- **Prefer putting new code in `fork-*` packages** (e.g., `fork-auth`, `fork-config`, `fork-ui`, `fork-security`, `fork-terminal`, `fork-cli`, `fork-provider`, `fork-tests`).
- **Minimize modifications to non-fork packages** (e.g., `app`, `opencode`, `sdk`, `ui`, `util`). When upstream changes are needed, keep the diff as small as possible — typically just an import and a single function call that delegates to a fork-* package.
- Use thin re-export shims in upstream packages that delegate to fork-* implementations (see `packages/opencode/src/server/routes/auth.ts` for the pattern).

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Prefer single word variable names where possible
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream

### Naming

Prefer single word names for variables and functions. Only use multiple words if necessary.

```ts
// Good
const foo = 1
function journal(dir: string) {}

// Bad
const fooBar = 1
function prepareJournal(dir: string) {}
```

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
