#!/usr/bin/env bun

const source = "AGENTS.md"
const target = "CLAUDE.md"

const sourceFile = Bun.file(source)
if (!(await sourceFile.exists())) {
  console.error(`rules:parity:sync failed: missing ${source}`)
  process.exit(1)
}

const sourceText = await sourceFile.text()
const targetFile = Bun.file(target)
const targetExists = await targetFile.exists()
const targetText = targetExists ? await targetFile.text() : ""

if (targetExists && sourceText === targetText) {
  console.log(`rules:parity:sync no-op: ${target} already matches ${source}`)
  process.exit(0)
}

await Bun.write(target, sourceText)
console.log(`rules:parity:sync updated: ${target} now matches ${source}`)
