import { config } from "./config.js";
import { AppDatabase } from "./db.js";
import { ConnectorRegistry } from "./connectors/index.js";
import { SearchPlanner } from "./planner.js";
import { PushService } from "./push.js";
import { PollWorker } from "./worker.js";
import { buildApp } from "./app.js";

const db = new AppDatabase(config.databasePath);
const connectors = new ConnectorRegistry();
const planner = new SearchPlanner();
const push = new PushService(db);
const worker = new PollWorker(db, connectors, push, config.workerTickSeconds, config.workerConcurrency);
const app = buildApp({ db, planner, worker, push });

worker.start();

const shutdown = async () => {
  worker.stop();
  await app.close();
  db.close();
};

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

await app.listen({ host: config.host, port: config.port });
