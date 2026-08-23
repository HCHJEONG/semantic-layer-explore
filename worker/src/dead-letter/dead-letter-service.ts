import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Kafka, type Producer } from "kafkajs";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { PostgresService } from "../persistence/postgres-service.js";

type DeadLetterInput = {
  topic: string;
  partition: number;
  offset: string;
  key?: Buffer | null;
  value?: Buffer | null;
  reason: string;
  error: unknown;
};

@Injectable()
export class DeadLetterService implements OnModuleDestroy {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly kafka = new Kafka({ clientId: `physicalai-worker-dlq-${config.workerId}`, brokers: config.kafkaBrokers });
  private readonly producer: Producer = this.kafka.producer();
  private connected = false;

  constructor(private readonly postgres: PostgresService) {}

  async record(input: DeadLetterInput) {
    const failedAt = new Date().toISOString();
    const payload = input.value?.toString("utf8");
    const payloadJson = parseJson(payload);
    const deadLetter = {
      schemaVersion: "dead-letter.v1" as const,
      deadLetterId: randomUUID(),
      sourceTopic: input.topic,
      sourcePartition: input.partition,
      sourceOffset: input.offset,
      key: input.key?.toString("utf8"),
      reason: input.reason,
      errorMessage: input.error instanceof Error ? input.error.message : String(input.error),
      payload,
      payloadJson,
      failedAt,
    };

    await this.postgres.insertDeadLetter(deadLetter);
    await this.publish(deadLetter);
    this.logger.warn(`dead-letter recorded topic=${input.topic} partition=${input.partition} offset=${input.offset} reason=${input.reason}`);
  }

  async onModuleDestroy() {
    if (this.connected) await this.producer.disconnect();
  }

  private async publish(deadLetter: {
    deadLetterId: string;
    sourceTopic: string;
    sourcePartition: number;
    sourceOffset: string;
    key?: string;
    reason: string;
    errorMessage: string;
    payload?: string;
    payloadJson?: unknown;
    failedAt: string;
    schemaVersion: "dead-letter.v1";
  }) {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
    await this.producer.send({
      topic: config.deadLetterTopic,
      messages: [{
        key: `${deadLetter.sourceTopic}:${deadLetter.sourcePartition}:${deadLetter.sourceOffset}`,
        value: JSON.stringify(deadLetter),
        headers: {
          schemaVersion: Buffer.from(deadLetter.schemaVersion),
          reason: Buffer.from(deadLetter.reason),
        },
      }],
    });
  }
}

function parseJson(payload: string | undefined) {
  if (!payload) return undefined;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
}
