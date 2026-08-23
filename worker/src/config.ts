export const config = {
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "kafka:9092").split(",").map((item) => item.trim()).filter(Boolean),
  telemetryTopic: process.env.KAFKA_TELEMETRY_TOPIC ?? "telemetry.raw",
  deadLetterTopic: process.env.KAFKA_DEAD_LETTER_TOPIC ?? "dead-letter",
  consumerGroup: process.env.KAFKA_TELEMETRY_GROUP ?? "physicalai-telemetry-workers",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://physicalai:physicalai@postgres:5432/physicalai",
  workerId: process.env.HOSTNAME ?? `worker-${process.pid}`,
  mastraTelemetryMode: process.env.MASTRA_TELEMETRY_MODE ?? "dry-run",
  mastraTemperatureThreshold: Number(process.env.MASTRA_TEMPERATURE_THRESHOLD ?? "31.5"),
  mastraDistanceThreshold: Number(process.env.MASTRA_DISTANCE_THRESHOLD ?? "10"),
};
