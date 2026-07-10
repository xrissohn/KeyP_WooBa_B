import type { Connector, SourcePlan } from "../types.js";
import { config } from "../config.js";
import { NaverConnector } from "./naver.js";
import { GoogleConnector } from "./google.js";
import { SaraminConnector } from "./saramin.js";
import { RssConnector } from "./rss.js";

export class ConnectorRegistry {
  private readonly connectors: Partial<Record<SourcePlan["provider"], Connector>>;

  constructor(overrides: Partial<Record<SourcePlan["provider"], Connector>> = {}) {
    this.connectors = {
      naver: new NaverConnector(config.naver),
      google: new GoogleConnector(config.google),
      saramin: new SaraminConnector(config.saramin.accessKey),
      rss: new RssConnector(),
      ...overrides,
    };
  }

  get(provider: SourcePlan["provider"]): Connector | undefined {
    return this.connectors[provider];
  }
}
