#!/usr/bin/env bun

const source = "AGENTS.md"
const target = "CLAUDE.md"

const sourceFile = Bun.file(source)
if (!(await sourceFile.exists())) {
  console.error(`rules:parity:check failed: missing ${source}`)
  process.exit(1)
}

const targetFile = Bun.file(target)
if (!(await targetFile.exists())) {
  console.error(`rules:parity:check failed: missing ${target}`)
  process.exit(1)
}

const sourceText = await sourceFile.text()
const targetText = await targetFile.text()

if (sourceText === targetText) {
  console.log(`rules:parity:check passed: ${source} and ${target} are identical`)
  process.exit(0)
}

console.error(`rules:parity:check failed: ${source} and ${target} differ`)
console.error("Run: bun run rules:parity:sync")
console.error(`Inspect: diff -u ${source} ${target}`)
process.exit(1)
