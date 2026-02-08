import path from "node:path"

let cached: string | undefined

// Stable identifier for this server's data volume. Generated once on first boot
// and persisted to disk. When volumes are wiped (e.g. `occ reset host`), a new
// epoch is generated, signaling the frontend to clear stale browser cache.
export async function epoch(dir: string): Promise<string> {
  if (cached) return cached
  const file = Bun.file(path.join(dir, ".epoch"))
  const existing = await file.text().catch(() => "")
  if (existing) {
    cached = existing
    return cached
  }
  cached = crypto.randomUUID()
  await Bun.write(file, cached)
  return cached
}
