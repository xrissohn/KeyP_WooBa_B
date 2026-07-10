import type { Connector, SourcePlan } from "../types.js";
import { config } from "../config.js";
import { NaverConnector } from "./naver.js";
import { XConnector } from "./x.js";
import { RssConnector } from "./rss.js";
import { AiSearchConnector } from "./ai-search.js";
import { SerpApiConnector } from "./serpapi.js";
import { YoutubeConnector } from "./youtube.js";

export class ConnectorRegistry {
  private readonly connectors: Partial<Record<SourcePlan["provider"], Connector>>;

  constructor(overrides: Partial<Record<SourcePlan["provider"], Connector>> = {}) {
    this.connectors = {
      naver: new NaverConnector(config.naver),
      x: new XConnector(config.x),
      rss: new RssConnector(),
      ai_search: new AiSearchConnector(),
      serpapi: new SerpApiConnector(config.serpapi),
      youtube: new YoutubeConnector(config.youtube),
      ...overrides,
    };
  }

  get(provider: SourcePlan["provider"]): Connector | undefined {
    return this.connectors[provider];
  }

  supportedProviders(): SourcePlan["provider"][] {
    return [...Object.keys(this.connectors), "webhook"] as SourcePlan["provider"][];
  }
}
