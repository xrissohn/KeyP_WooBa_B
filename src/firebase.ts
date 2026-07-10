import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { config } from "./config.js";

export function getFirebaseAdminApp(): App | undefined {
  if (!config.firebase.serviceAccountJson && !config.firebase.projectId) return undefined;
  const existing = getApps()[0];
  if (existing) return existing;
  const credential = config.firebase.serviceAccountJson
    ? cert(JSON.parse(config.firebase.serviceAccountJson) as ServiceAccount)
    : applicationDefault();
  return initializeApp({ credential, projectId: config.firebase.projectId });
}

export class AppCheckService {
  readonly enforced = config.firebase.appCheckEnforced;

  async verify(token: string | undefined): Promise<void> {
    if (!this.enforced) return;
    if (!token) {
      throw Object.assign(new Error("x-firebase-appcheck header is required"), { statusCode: 401 });
    }
    const app = getFirebaseAdminApp();
    if (!app) throw new Error("Firebase credentials are required when App Check is enforced");
    try {
      await getAppCheck(app).verifyToken(token);
    } catch {
      throw Object.assign(new Error("Invalid Firebase App Check token"), { statusCode: 401 });
    }
  }
}
