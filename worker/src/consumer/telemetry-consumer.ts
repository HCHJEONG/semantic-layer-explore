import { Injectable, Logger } from "@nestjs/common";
import { Kafka, logLevel, type Consumer } from "kafkajs";
import { config } from "../config.js";
import { parseTelemetry } from "../contracts/telemetry.js";
import { TelemetryService } from "../telemetry/telemetry-service.js";

@Injectable()
export class TelemetryConsumer {
  private readonly logger = new Logger(TelemetryConsumer.name);
  private readonly kafka = new Kafka({ clientId: `physicalai-worker-${config.workerId}`, brokers: config.kafkaBrokers, logLevel: logLevel.INFO });
  private readonly consumer: Consumer = this.kafka.consumer({ groupId: config.consumerGroup });

  constructor(private readonly telemetry: TelemetryService) {}

  async startWithRetry() {
    let attempt = 0;
    while (true) {
      try {
        await this.start();
        return;
      } catch (error) {
        attempt += 1;
        const delayMs = Math.min(30_000, 1_000 * attempt);
        this.logger.warn(`consumer start failed; retrying in ${delayMs}ms: ${error instanceof Error ? error.message : String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: config.telemetryTopic, fromBeginning: false });
    this.logger.log(`worker ${config.workerId} consuming ${config.telemetryTopic} as ${config.consumerGroup}`);
    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;
        const event = parseTelemetry(message.value);
        await this.telemetry.handle(event, { topic, partition, offset: message.offset });
        await this.consumer.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
      },
    });
  }

  async stop() {
    await this.consumer.disconnect();
  }
}
