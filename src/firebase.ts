import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { readFileSync } from "node:fs";
import { config } from "./config.js";

function loadServiceAccount(): ServiceAccount | undefined {
  const raw = config.firebase.serviceAccountJson
    ?? (config.firebase.serviceAccountPath ? readFileSync(config.firebase.serviceAccountPath, "utf8") : undefined);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as Partial<ServiceAccount> & {
    type?: string;
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  const hasProjectId = Boolean(parsed.projectId ?? parsed.project_id);
  const hasClientEmail = Boolean(parsed.clientEmail ?? parsed.client_email);
  const hasPrivateKey = Boolean(parsed.privateKey ?? parsed.private_key);
  if (parsed.type !== "service_account" || !hasProjectId || !hasClientEmail || !hasPrivateKey) {
    throw new Error(
      "Firebase Admin service account is invalid. Use a service account key JSON with project_id, client_email, and private_key; google-services.json is only for the client app.",
    );
  }
  return parsed as ServiceAccount;
}

export function getFirebaseAdminApp(): App | undefined {
  if (!config.firebase.serviceAccountJson && !config.firebase.serviceAccountPath && !config.firebase.projectId) return undefined;
  const existing = getApps()[0];
  if (existing) return existing;
  const serviceAccount = loadServiceAccount();
  const credential = serviceAccount ? cert(serviceAccount) : applicationDefault();
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
