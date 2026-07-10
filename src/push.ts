import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { config } from "./config.js";
import type { AppDatabase } from "./db.js";
import type { CollectedItem } from "./types.js";

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export class PushService {
  private readonly enabled: boolean;

  constructor(private readonly db: AppDatabase) {
    this.enabled = Boolean(config.firebase.serviceAccountJson || config.firebase.projectId);
    if (this.enabled && getApps().length === 0) {
      const credential = config.firebase.serviceAccountJson
        ? cert(JSON.parse(config.firebase.serviceAccountJson) as ServiceAccount)
        : applicationDefault();
      initializeApp({ credential, projectId: config.firebase.projectId });
    }
  }

  async send(userId: string, subscriptionId: string, events: Array<{ eventId: number; item: CollectedItem }>): Promise<void> {
    if (!this.enabled || events.length === 0) return;
    const tokens = this.db.getDeviceTokens(userId);
    if (tokens.length === 0) return;

    for (const event of events) {
      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: event.item.title.slice(0, 120),
          body: (event.item.summary || "새로운 관심 정보가 등록되었습니다.").slice(0, 240),
        },
        data: {
          subscriptionId,
          eventCursor: String(event.eventId),
          provider: event.item.provider,
          url: event.item.url,
        },
      });
      response.responses.forEach((result, index) => {
        if (!result.success && result.error && INVALID_TOKEN_CODES.has(result.error.code)) {
          const token = tokens[index];
          if (token) this.db.deactivateDevice(token);
        }
      });
      if (response.successCount > 0) this.db.markPushSent([event.eventId], new Date().toISOString());
    }
  }
}
