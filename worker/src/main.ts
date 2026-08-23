import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./module.js";
import { TelemetryConsumer } from "./consumer/telemetry-consumer.js";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["log", "warn", "error"] });
  const consumer = app.get(TelemetryConsumer);
  await consumer.startWithRetry();

  const shutdown = async () => {
    await consumer.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap();
