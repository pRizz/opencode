#!/usr/bin/env bun

import path from "path"
import ts from "typescript"

const root = path.resolve(import.meta.dir, "../../../..")

const pairs = [
  {
    kind: "sdk",
    src: path.join(root, "packages/sdk/js/src/gen/sdk.gen.ts"),
    dist: path.join(root, "packages/sdk/js/dist/gen/sdk.gen.d.ts"),
  },
  {
    kind: "sdk",
    src: path.join(root, "packages/sdk/js/src/v2/gen/sdk.gen.ts"),
    dist: path.join(root, "packages/sdk/js/dist/v2/gen/sdk.gen.d.ts"),
  },
  {
    kind: "types",
    src: path.join(root, "packages/sdk/js/src/gen/types.gen.ts"),
    dist: path.join(root, "packages/sdk/js/dist/gen/types.gen.d.ts"),
  },
  {
    kind: "types",
    src: path.join(root, "packages/sdk/js/src/v2/gen/types.gen.ts"),
    dist: path.join(root, "packages/sdk/js/dist/v2/gen/types.gen.d.ts"),
  },
] as const

function toSet(values: string[]) {
  return new Set(values)
}

function diff(a: Set<string>, b: Set<string>) {
  return [...a].filter((item) => !b.has(item))
}

function exported(node: ts.Node) {
  return node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function textName(node: ts.PropertyName | ts.BindingName | undefined) {
  if (!node) return
  if (ts.isIdentifier(node)) return node.text
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return node.text
}

function sdkSymbols(file: string, text: string) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const classes = new Set<string>()
  const methods = new Map<string, Set<string>>()

  for (const node of source.statements) {
    if (!ts.isClassDeclaration(node)) continue
    if (!node.name) continue
    if (!exported(node)) continue

    const cls = node.name.text
    classes.add(cls)
    const set = new Set<string>()
    methods.set(cls, set)

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue
      const name = textName(member.name)
      if (!name) continue
      set.add(name)
    }
  }

  return { classes, methods }
}

function typeAliases(file: string, text: string) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = new Set<string>()

  for (const node of source.statements) {
    if (!ts.isTypeAliasDeclaration(node)) continue
    if (!exported(node)) continue
    aliases.add(node.name.text)
  }

  return aliases
}

function rel(file: string) {
  return path.relative(root, file)
}

async function runSdkBuild() {
  const proc = Bun.spawn(["./packages/sdk/js/script/build.ts"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`./packages/sdk/js/script/build.ts failed (${code})`)
  }
}

const missingDistBeforeCheck = await Promise.all(
  pairs.map(async (pair) => ((await Bun.file(pair.dist).exists()) ? null : pair.dist)),
).then((values) => values.filter((value): value is string => Boolean(value)))

if (missingDistBeforeCheck.length) {
  console.warn(
    `sdk:parity:check bootstrap: missing ${missingDistBeforeCheck.length} dist artifact(s); running ./packages/sdk/js/script/build.ts`,
  )
  await runSdkBuild()
}

let ok = true
const lines: string[] = []

for (const pair of pairs) {
  const srcFile = Bun.file(pair.src)
  const distFile = Bun.file(pair.dist)

  if (!(await srcFile.exists())) {
    ok = false
    lines.push(`missing source file: ${rel(pair.src)}`)
    continue
  }
  if (!(await distFile.exists())) {
    ok = false
    lines.push(`missing dist file: ${rel(pair.dist)}`)
    continue
  }

  const src = await srcFile.text()
  const dist = await distFile.text()

  if (pair.kind === "sdk") {
    const srcSymbols = sdkSymbols(pair.src, src)
    const distSymbols = sdkSymbols(pair.dist, dist)

    const missingClasses = diff(srcSymbols.classes, distSymbols.classes)
    const extraClasses = diff(distSymbols.classes, srcSymbols.classes)

    const missingMethods: string[] = []
    const extraMethods: string[] = []
    for (const cls of [...srcSymbols.classes].sort()) {
      const srcSet = srcSymbols.methods.get(cls) ?? new Set<string>()
      const distSet = distSymbols.methods.get(cls) ?? new Set<string>()
      for (const name of diff(srcSet, distSet).sort()) missingMethods.push(`${cls}.${name}`)
      for (const name of diff(distSet, srcSet).sort()) extraMethods.push(`${cls}.${name}`)
    }

    if (missingClasses.length || extraClasses.length || missingMethods.length || extraMethods.length) {
      ok = false
      lines.push(`sdk mismatch: ${rel(pair.src)} <> ${rel(pair.dist)}`)
      if (missingClasses.length) lines.push(`  missing classes in dist: ${missingClasses.sort().join(", ")}`)
      if (extraClasses.length) lines.push(`  extra classes in dist: ${extraClasses.sort().join(", ")}`)
      if (missingMethods.length) lines.push(`  missing methods in dist: ${missingMethods.sort().join(", ")}`)
      if (extraMethods.length) lines.push(`  extra methods in dist: ${extraMethods.sort().join(", ")}`)
    }
    continue
  }

  const srcAliases = typeAliases(pair.src, src)
  const distAliases = typeAliases(pair.dist, dist)
  const missingAliases = diff(srcAliases, distAliases)
  const extraAliases = diff(distAliases, srcAliases)

  if (missingAliases.length || extraAliases.length) {
    ok = false
    lines.push(`types mismatch: ${rel(pair.src)} <> ${rel(pair.dist)}`)
    if (missingAliases.length) lines.push(`  missing aliases in dist: ${missingAliases.sort().join(", ")}`)
    if (extraAliases.length) lines.push(`  extra aliases in dist: ${extraAliases.sort().join(", ")}`)
  }
}

if (!ok) {
  console.error("sdk:parity:check failed")
  for (const line of lines) console.error(line)
  console.error("Run: ./packages/sdk/js/script/build.ts")
  process.exit(1)
}

console.log("sdk:parity:check passed")
