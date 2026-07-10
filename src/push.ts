import { getMessaging } from "firebase-admin/messaging";
import type { AppDatabase } from "./db.js";
import { getFirebaseAdminApp } from "./firebase.js";
import type { CollectedItem } from "./types.js";

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export class PushService {
  private readonly app = getFirebaseAdminApp();

  constructor(private readonly db: AppDatabase) {}

  async send(installationId: string, subscriptionId: string, events: Array<{ eventId: number; item: CollectedItem }>): Promise<void> {
    if (!this.app || events.length === 0) return;
    const tokens = this.db.getDeviceTokens(installationId);
    if (tokens.length === 0) return;

    for (const event of events) {
      const initializedAt = new Date().toISOString();
      this.db.ensurePushDeliveries(event.eventId, tokens, initializedAt);
      while (true) {
        const attemptAt = new Date().toISOString();
        const dueTokens = this.db.getDuePushTokens(event.eventId, attemptAt, 500);
        if (dueTokens.length === 0) break;
        try {
          const response = await getMessaging(this.app).sendEachForMulticast({
            tokens: dueTokens,
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
            const token = dueTokens[index];
            if (!token) return;
            if (result.success) {
              this.db.markPushDelivery({ eventId: event.eventId, token, status: "sent", now: attemptAt });
              return;
            }
            const code = result.error?.code;
            if (code && INVALID_TOKEN_CODES.has(code)) {
              this.db.markPushDelivery({
                eventId: event.eventId,
                token,
                status: "invalid",
                now: attemptAt,
                error: code,
              });
              this.db.deactivateDevice(token);
              return;
            }
            this.db.markPushDelivery({
              eventId: event.eventId,
              token,
              status: "pending",
              now: attemptAt,
              nextAttemptAt: new Date(Date.parse(attemptAt) + 60_000).toISOString(),
              error: code ?? result.error?.message ?? "FCM delivery failed",
            });
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const nextAttemptAt = new Date(Date.parse(attemptAt) + 60_000).toISOString();
          for (const token of dueTokens) {
            this.db.markPushDelivery({
              eventId: event.eventId,
              token,
              status: "pending",
              now: attemptAt,
              nextAttemptAt,
              error: message,
            });
          }
        }
      }
      this.db.completePushEventIfDelivered(event.eventId, new Date().toISOString());
    }
  }
}
