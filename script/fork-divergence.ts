#!/usr/bin/env bun

const CSV_PATH = "data/fork-divergence.csv"
const README_PATH = "README.md"
const BEGIN_MARKER = "<!-- BEGIN:fork-divergence -->"
const END_MARKER = "<!-- END:fork-divergence -->"
const CSV_HEADER =
  "date,merge_base,upstream_commits,fork_commits,merge_base_age_days,modified_files,modified_lines_added,modified_lines_removed,added_files,added_lines,total_divergent_files,total_lines_changed"

async function git(...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`git ${args.join(" ")} failed (${code}): ${stderr.trim()}`)
  }
  return stdout.trim()
}

function parseNumstat(output: string) {
  if (!output) return { files: 0, added: 0, removed: 0 }
  let files = 0
  let added = 0
  let removed = 0
  for (const line of output.split("\n")) {
    if (!line) continue
    const [a, r] = line.split("\t")
    if (a === "-" || r === "-") continue // binary
    files++
    added += parseInt(a) || 0
    removed += parseInt(r) || 0
  }
  return { files, added, removed }
}

async function computeMetrics(commit: string, date: string) {
  const base = await git("merge-base", commit, "upstream/dev")

  const [upstreamCommits, forkCommits, baseDate, modifiedRaw, addedRaw] = await Promise.all([
    git("rev-list", "--count", `${base}..upstream/dev`),
    git("rev-list", "--count", `${base}..${commit}`),
    git("log", "-1", "--format=%aI", base),
    git("diff", "--numstat", "--diff-filter=M", `${base}..${commit}`).catch(() => ""),
    git("diff", "--numstat", "--diff-filter=A", `${base}..${commit}`).catch(() => ""),
  ])

  const age = Math.max(0, Math.floor((new Date(date).getTime() - new Date(baseDate).getTime()) / 86_400_000))
  const modified = parseNumstat(modifiedRaw)
  const added = parseNumstat(addedRaw)

  return {
    date,
    merge_base: base.slice(0, 7),
    upstream_commits: parseInt(upstreamCommits),
    fork_commits: parseInt(forkCommits),
    merge_base_age_days: age,
    modified_files: modified.files,
    modified_lines_added: modified.added,
    modified_lines_removed: modified.removed,
    added_files: added.files,
    added_lines: added.added,
    total_divergent_files: modified.files + added.files,
    total_lines_changed: modified.added + modified.removed + added.added,
  }
}

type Row = Awaited<ReturnType<typeof computeMetrics>>

function rowToCsv(row: Row) {
  return [
    row.date,
    row.merge_base,
    row.upstream_commits,
    row.fork_commits,
    row.merge_base_age_days,
    row.modified_files,
    row.modified_lines_added,
    row.modified_lines_removed,
    row.added_files,
    row.added_lines,
    row.total_divergent_files,
    row.total_lines_changed,
  ].join(",")
}

function formatNumber(n: number) {
  return n.toLocaleString("en-US")
}

function renderReadmeTable(row: Row) {
  return [
    "| Metric | Value |",
    "|--------|-------|",
    `| Merge base | \`${row.merge_base}\` |`,
    `| Merge base age | ${row.merge_base_age_days} days |`,
    `| Upstream commits since base | ${formatNumber(row.upstream_commits)} |`,
    `| Fork commits since base | ${formatNumber(row.fork_commits)} |`,
    `| Modified upstream files | ${formatNumber(row.modified_files)} (+${formatNumber(row.modified_lines_added)} / -${formatNumber(row.modified_lines_removed)} lines) |`,
    `| Fork-only files | ${formatNumber(row.added_files)} (+${formatNumber(row.added_lines)} lines) |`,
    `| **Total divergent files** | **${formatNumber(row.total_divergent_files)}** |`,
    `| **Total lines changed** | **${formatNumber(row.total_lines_changed)}** |`,
    "",
    `*Last updated: ${row.date} — [historical data](data/fork-divergence.csv)*`,
  ].join("\n")
}

async function readCsv(): Promise<string[]> {
  try {
    const text = await Bun.file(CSV_PATH).text()
    return text.trim().split("\n")
  } catch {
    return []
  }
}

async function existingDates(lines: string[]): Promise<Set<string>> {
  const dates = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    const date = lines[i].split(",")[0]
    if (date) dates.add(date)
  }
  return dates
}

async function backfill() {
  console.log("Backfilling historical data...")

  // Find the fork start date from the earliest fork-only commit
  const earliest = await git("log", "--format=%aI", "--left-only", "dev...upstream/dev").then(
    (r) => r.trim().split("\n").pop()?.split("T")[0],
  )
  if (!earliest) {
    console.log("No fork-only commits found, skipping backfill")
    return []
  }

  const today = new Date().toISOString().split("T")[0]
  console.log(`Fork started: ${earliest}, backfilling to yesterday`)

  const rows: Row[] = []
  let lastForkCommit: string | null = null
  const d = new Date(earliest + "T00:00:00Z")
  const end = new Date(today + "T00:00:00Z")

  while (d < end) {
    const dateStr = d.toISOString().split("T")[0]
    const nextDay = new Date(d.getTime() + 86_400_000).toISOString().split("T")[0]

    try {
      const commit = await git("log", "-1", "--format=%H", `--before=${nextDay}T00:00:00Z`, "dev")
      if (!commit) {
        d.setUTCDate(d.getUTCDate() + 1)
        continue
      }

      // check if this commit has fork divergence
      const base = await git("merge-base", commit, "upstream/dev")
      if (base !== commit) {
        lastForkCommit = commit
      }

      if (!lastForkCommit) {
        console.log(`  ${dateStr}: no fork divergence yet`)
        d.setUTCDate(d.getUTCDate() + 1)
        continue
      }

      const carried = base === commit && lastForkCommit !== commit
      console.log(`  ${dateStr}: ${lastForkCommit.slice(0, 7)}${carried ? " (carried forward)" : ""}`)
      const row = await computeMetrics(lastForkCommit, dateStr)
      rows.push(row)
    } catch (e) {
      console.log(`  ${dateStr}: skipped (${e instanceof Error ? e.message : e})`)
    }

    d.setUTCDate(d.getUTCDate() + 1)
  }

  console.log(`Backfilled ${rows.length} days`)
  return rows
}

// --- main ---

const today = new Date().toISOString().split("T")[0]
console.log(`Fork divergence tracker — ${today}`)

const csvLines = await readCsv()
const hasData = csvLines.length > 1
const known = await existingDates(csvLines)

const rows: Row[] = []

if (!hasData) {
  const historical = await backfill()
  rows.push(...historical)
}

if (!known.has(today)) {
  console.log("Computing today's metrics...")
  const todayRow = await computeMetrics("HEAD", today)
  rows.push(todayRow)
  console.log(
    `  Modified: ${todayRow.modified_files} files (+${todayRow.modified_lines_added}/-${todayRow.modified_lines_removed})`,
  )
  console.log(`  Added: ${todayRow.added_files} files (+${todayRow.added_lines})`)
  console.log(`  Total: ${todayRow.total_divergent_files} files, ${todayRow.total_lines_changed} lines changed`)
} else {
  console.log("Today's data already exists, skipping")
}

if (rows.length === 0) {
  console.log("No new rows to write")
  process.exit(0)
}

// Write CSV
const existingCsv = hasData ? csvLines.join("\n") : CSV_HEADER
const newCsvLines = rows.map(rowToCsv)
await Bun.write(CSV_PATH, existingCsv + "\n" + newCsvLines.join("\n") + "\n")
console.log(`Wrote ${rows.length} row(s) to ${CSV_PATH}`)

// Update README
const latest = rows[rows.length - 1]
const readme = await Bun.file(README_PATH).text()
const beginIdx = readme.indexOf(BEGIN_MARKER)
const endIdx = readme.indexOf(END_MARKER)

if (beginIdx === -1 || endIdx === -1) {
  console.warn("README markers not found, skipping README update")
  process.exit(0)
}

const before = readme.slice(0, beginIdx + BEGIN_MARKER.length)
const after = readme.slice(endIdx)
const updated = before + "\n" + renderReadmeTable(latest) + "\n" + after
await Bun.write(README_PATH, updated)
console.log("Updated README.md")
