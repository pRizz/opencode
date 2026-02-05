import type { Config } from "../../../opencode/src/config/config"
import type { Provider } from "../../../opencode/src/provider/provider"
import type { OpenRouterConfig } from "./config"
import { augmentOpenRouterModels, getOpenRouterPreferredModels } from "./openrouter"

export function augmentForkProviders(params: {
  providers: Record<string, Provider.Info>
  config: Config.Info
}): void {
  const openrouterProvider = params.providers["openrouter"]
  if (!openrouterProvider) return

  augmentOpenRouterModels(openrouterProvider, params.config.openrouter as OpenRouterConfig | undefined)
}

export function getForkPreferredModels(params: {
  provider: Provider.Info
  models: Provider.Model[]
  config: Config.Info
}): Provider.Model[] | undefined {
  return getOpenRouterPreferredModels(params.provider)
}
