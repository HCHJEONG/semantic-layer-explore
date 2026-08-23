export const config = {
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "kafka:9092").split(",").map((item) => item.trim()).filter(Boolean),
  telemetryTopic: process.env.KAFKA_TELEMETRY_TOPIC ?? "telemetry.raw",
  consumerGroup: process.env.KAFKA_TELEMETRY_GROUP ?? "physicalai-telemetry-workers",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://physicalai:physicalai@postgres:5432/physicalai",
  workerId: process.env.HOSTNAME ?? `worker-${process.pid}`,
};
