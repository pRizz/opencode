export type BadgeSource = "opencode-cloud" | "opencode-submodule"
export type BadgeVariant = "core" | "full"
export type BadgeTier = "core" | "extra"

export interface ReadmeBadge {
  id: string
  source: BadgeSource
  tier: BadgeTier
  label: string
  imageUrl: string
  linkUrl: string
}

export interface WelcomeBadgeSection {
  source: BadgeSource
  title: string
  badges: ReadonlyArray<ReadmeBadge>
}

const README_BADGES: ReadonlyArray<ReadmeBadge> = [
  {
    id: "cloud-github-stars",
    source: "opencode-cloud",
    tier: "core",
    label: "GitHub Stars",
    imageUrl: "https://img.shields.io/github/stars/pRizz/opencode-cloud",
    linkUrl: "https://github.com/pRizz/opencode-cloud",
  },
  {
    id: "cloud-ci",
    source: "opencode-cloud",
    tier: "core",
    label: "CI",
    imageUrl: "https://github.com/pRizz/opencode-cloud/actions/workflows/ci.yml/badge.svg",
    linkUrl: "https://github.com/pRizz/opencode-cloud/actions/workflows/ci.yml",
  },
  {
    id: "cloud-mirror",
    source: "opencode-cloud",
    tier: "extra",
    label: "Mirror",
    imageUrl: "https://img.shields.io/badge/mirror-gitea-blue?logo=gitea",
    linkUrl: "https://gitea.com/pRizz/opencode-cloud",
  },
  {
    id: "cloud-crates-version",
    source: "opencode-cloud",
    tier: "extra",
    label: "crates.io",
    imageUrl: "https://img.shields.io/crates/v/opencode-cloud.svg",
    linkUrl: "https://crates.io/crates/opencode-cloud",
  },
  {
    id: "cloud-crates-downloads",
    source: "opencode-cloud",
    tier: "extra",
    label: "Crates Downloads",
    imageUrl: "https://img.shields.io/crates/d/opencode-cloud.svg",
    linkUrl: "https://crates.io/crates/opencode-cloud",
  },
  {
    id: "cloud-npm-downloads",
    source: "opencode-cloud",
    tier: "core",
    label: "npm Downloads",
    imageUrl: "https://img.shields.io/npm/dt/opencode-cloud?logo=npm",
    linkUrl: "https://www.npmjs.com/package/opencode-cloud",
  },
  {
    id: "cloud-docker-hub",
    source: "opencode-cloud",
    tier: "core",
    label: "Docker Hub",
    imageUrl: "https://img.shields.io/docker/v/prizz/opencode-cloud-sandbox?label=docker&sort=semver",
    linkUrl: "https://hub.docker.com/r/prizz/opencode-cloud-sandbox",
  },
  {
    id: "cloud-docker-pulls",
    source: "opencode-cloud",
    tier: "extra",
    label: "Docker Pulls",
    imageUrl: "https://img.shields.io/docker/pulls/prizz/opencode-cloud-sandbox",
    linkUrl: "https://hub.docker.com/r/prizz/opencode-cloud-sandbox",
  },
  {
    id: "cloud-ghcr",
    source: "opencode-cloud",
    tier: "extra",
    label: "GHCR",
    imageUrl: "https://img.shields.io/badge/ghcr.io-sandbox-blue?logo=github",
    linkUrl: "https://github.com/pRizz/opencode-cloud/pkgs/container/opencode-cloud-sandbox",
  },
  {
    id: "cloud-docs-rs",
    source: "opencode-cloud",
    tier: "extra",
    label: "docs.rs",
    imageUrl: "https://docs.rs/opencode-cloud/badge.svg",
    linkUrl: "https://docs.rs/opencode-cloud",
  },
  {
    id: "cloud-msrv",
    source: "opencode-cloud",
    tier: "extra",
    label: "MSRV",
    imageUrl: "https://img.shields.io/badge/MSRV-1.85-blue.svg",
    linkUrl: "https://blog.rust-lang.org/2025/02/20/Rust-1.85.0.html",
  },
  {
    id: "cloud-license",
    source: "opencode-cloud",
    tier: "core",
    label: "License: MIT",
    imageUrl: "https://img.shields.io/badge/License-MIT-yellow.svg",
    linkUrl: "https://opensource.org/licenses/MIT",
  },
  {
    id: "opencode-discord",
    source: "opencode-submodule",
    tier: "core",
    label: "Discord",
    imageUrl: "https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord",
    linkUrl: "https://opencode.ai/discord",
  },
  {
    id: "opencode-npm-version",
    source: "opencode-submodule",
    tier: "core",
    label: "npm",
    imageUrl: "https://img.shields.io/npm/v/opencode-ai?style=flat-square",
    linkUrl: "https://www.npmjs.com/package/opencode-ai",
  },
  {
    id: "opencode-build-status",
    source: "opencode-submodule",
    tier: "core",
    label: "Build status",
    imageUrl: "https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev",
    linkUrl: "https://github.com/anomalyco/opencode/actions/workflows/publish.yml",
  },
]

const WELCOME_SECTION_TITLE: Record<BadgeSource, string> = {
  "opencode-cloud": "OpenCode Cloud (superproject README badges)",
  "opencode-submodule": "OpenCode base/fork (packages/opencode README badges)",
}

export function getBadges(source: BadgeSource, variant: BadgeVariant): ReadonlyArray<ReadmeBadge> {
  return README_BADGES.filter((badge) => badge.source === source && (variant === "full" || badge.tier === "core"))
}

export function getWelcomeBadgeSections(variant: BadgeVariant): ReadonlyArray<WelcomeBadgeSection> {
  return [
    {
      source: "opencode-cloud",
      title: WELCOME_SECTION_TITLE["opencode-cloud"],
      badges: getBadges("opencode-cloud", variant),
    },
    {
      source: "opencode-submodule",
      title: WELCOME_SECTION_TITLE["opencode-submodule"],
      badges: getBadges("opencode-submodule", variant),
    },
  ]
}
