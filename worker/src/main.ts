import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./module.js";
import { TelemetryConsumer } from "./consumer/telemetry-consumer.js";
import { config } from "./config.js";
import { HealthServer } from "./health/health-server.js";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });
  const consumer = app.get(TelemetryConsumer);
  const health = new HealthServer(config.healthPort);
  const startup = new AbortController();
  await health.start();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    health.markNotReady();
    startup.abort();
    await consumer.stop();
    await app.close();
    await health.stop();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await consumer.startWithRetry(startup.signal);
  if (!shuttingDown) health.markReady();
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
