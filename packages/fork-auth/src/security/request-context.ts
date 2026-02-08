export type TrustProxySetting = boolean | "auto" | undefined
export type TrustProxyMode = "off" | "on" | "auto"
export type EffectiveProto = "http" | "https"
export interface RequestContextLike {
  req: {
    url: string
    header: (name: string) => string | undefined
  }
}

const RAILWAY_ENV_KEYS = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_REPLICA_ID",
  "RAILWAY_STATIC_URL",
  "RAILWAY_PRIVATE_DOMAIN",
]

function isTruthyEnv(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function firstHeaderValue(header: string | undefined): string | undefined {
  if (!header) return undefined
  const first = header.split(",")[0]?.trim()
  return first && first.length > 0 ? first : undefined
}

function parseForwardedParam(header: string | undefined, keyName: "proto" | "host"): string | undefined {
  const first = firstHeaderValue(header)
  if (!first) return undefined

  for (const part of first.split(";")) {
    const [rawKey, rawValue] = part.split("=", 2)
    if (!rawKey || rawValue === undefined) continue
    if (rawKey.trim().toLowerCase() !== keyName) continue

    let value = rawValue.trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1)
    }
    if (!value) return undefined
    return value
  }

  return undefined
}

function parseForwardedProto(header: string | undefined): EffectiveProto | undefined {
  const value = parseForwardedParam(header, "proto")?.toLowerCase()
  if (value === "https") return "https"
  if (value === "http") return "http"
  return undefined
}

function parseXForwardedProto(header: string | undefined): EffectiveProto | undefined {
  const value = firstHeaderValue(header)?.toLowerCase()
  if (value === "https") return "https"
  if (value === "http") return "http"
  return undefined
}

function parseForwardedHost(header: string | undefined): string | undefined {
  return parseForwardedParam(header, "host")
}

function parseXForwardedHost(header: string | undefined): string | undefined {
  return firstHeaderValue(header)
}

function parseDirectProtocol(url: string): EffectiveProto {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "https:") return "https"
  } catch {
    // Fall through to conservative default.
  }
  return "http"
}

function normalizeHostForCompare(host: string): string {
  return host.trim().toLowerCase()
}

function parseBrowserSecureHint(c: RequestContextLike): { origin: URL } | undefined {
  const secureContextHeader = c.req.header("X-Opencode-Secure-Context")
  if (secureContextHeader !== "1") return undefined

  const windowOriginHeader = c.req.header("X-Opencode-Window-Origin")
  if (!windowOriginHeader) return undefined

  const originHeader = c.req.header("Origin")
  if (originHeader && originHeader !== windowOriginHeader) return undefined

  try {
    const originUrl = new URL(windowOriginHeader)
    if (originUrl.protocol !== "https:") return undefined
    return { origin: originUrl }
  } catch {
    return undefined
  }
}

function shouldUseBrowserSecureHint(c: RequestContextLike, mode: TrustProxyMode, effectiveHost: string): boolean {
  if (mode !== "auto") return false
  if (!isManagedProxyEnvironment()) return false

  const parsedHint = parseBrowserSecureHint(c)
  if (!parsedHint) return false

  return normalizeHostForCompare(parsedHint.origin.host) === normalizeHostForCompare(effectiveHost)
}

function parseDirectHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ""
  }
}

export function resolveTrustProxyMode(setting: TrustProxySetting): TrustProxyMode {
  if (setting === true) return "on"
  if (setting === false) return "off"
  return "auto"
}

export function isManagedProxyEnvironment(): boolean {
  return RAILWAY_ENV_KEYS.some((key) => isTruthyEnv(process.env[key]))
}

export function shouldTrustForwardedHeaders(setting: TrustProxySetting | TrustProxyMode): boolean {
  const mode = setting === "on" || setting === "off" || setting === "auto" ? setting : resolveTrustProxyMode(setting)
  if (mode === "on") return true
  if (mode === "off") return false
  return isManagedProxyEnvironment()
}

export function getEffectiveHost(c: RequestContextLike, trustProxy: TrustProxySetting): string {
  if (shouldTrustForwardedHeaders(trustProxy)) {
    const forwardedHost = parseForwardedHost(c.req.header("Forwarded"))
    if (forwardedHost) return forwardedHost

    const xForwardedHost = parseXForwardedHost(c.req.header("X-Forwarded-Host"))
    if (xForwardedHost) return xForwardedHost
  }

  const host = c.req.header("Host")
  if (host) return host.trim()

  return parseDirectHost(c.req.url)
}

export function getEffectiveProto(c: RequestContextLike, trustProxy: TrustProxySetting): EffectiveProto {
  const mode = resolveTrustProxyMode(trustProxy)
  if (shouldTrustForwardedHeaders(mode)) {
    const forwardedProto = parseForwardedProto(c.req.header("Forwarded"))
    if (forwardedProto) return forwardedProto

    const xForwardedProto = parseXForwardedProto(c.req.header("X-Forwarded-Proto"))
    if (xForwardedProto) return xForwardedProto
  }

  const directProto = parseDirectProtocol(c.req.url)
  if (directProto === "https") return "https"

  const effectiveHost = getEffectiveHost(c, trustProxy)
  if (effectiveHost && shouldUseBrowserSecureHint(c, mode, effectiveHost)) {
    return "https"
  }

  return directProto
}

export function isEffectiveHttps(c: RequestContextLike, trustProxy: TrustProxySetting): boolean {
  return getEffectiveProto(c, trustProxy) === "https"
}

export function getEffectiveRequestUrl(c: RequestContextLike, trustProxy: TrustProxySetting): URL {
  const effectiveProto = getEffectiveProto(c, trustProxy)
  const effectiveHost = getEffectiveHost(c, trustProxy)

  try {
    const requestUrl = new URL(c.req.url)
    requestUrl.protocol = `${effectiveProto}:`
    if (effectiveHost) {
      requestUrl.host = effectiveHost
    }
    return requestUrl
  } catch {
    return new URL(`${effectiveProto}://${effectiveHost || "localhost"}`)
  }
}

export function getEffectiveOrigin(c: RequestContextLike, trustProxy: TrustProxySetting): string {
  return getEffectiveRequestUrl(c, trustProxy).origin
}
