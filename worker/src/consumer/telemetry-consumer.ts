import { Injectable, Logger } from "@nestjs/common";
import { Kafka, logLevel, type Consumer } from "kafkajs";
import { config } from "../config.js";
import { parseTelemetry } from "../contracts/telemetry.js";
import { DeadLetterService } from "../dead-letter/dead-letter-service.js";
import { TelemetryService } from "../telemetry/telemetry-service.js";
import { parseCommandResult } from "../contracts/command-result.js";
import { CommandResultService } from "../commands/command-result-service.js";

@Injectable()
export class TelemetryConsumer {
  private readonly logger = new Logger(TelemetryConsumer.name);
  private readonly kafka = new Kafka({ clientId: `physicalai-worker-${config.workerId}`, brokers: config.kafkaBrokers, logLevel: logLevel.INFO });
  private readonly consumer: Consumer = this.kafka.consumer({ groupId: config.consumerGroup });

  constructor(
    private readonly telemetry: TelemetryService,
    private readonly deadLetters: DeadLetterService,
    private readonly commandResults: CommandResultService,
  ) {}

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
    await this.consumer.subscribe({ topic: config.commandResultTopic, fromBeginning: false });
    this.logger.log(`worker ${config.workerId} consuming ${config.telemetryTopic} and ${config.commandResultTopic} as ${config.consumerGroup}`);
    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          if (!message.value) throw new Error("Kafka message value is empty");
          if (topic === config.commandResultTopic) await this.commandResults.handle(parseCommandResult(message.value));
          else await this.telemetry.handle(parseTelemetry(message.value), { topic, partition, offset: message.offset });
        } catch (error) {
          await this.deadLetters.record({
            topic,
            partition,
            offset: message.offset,
            key: message.key,
            value: message.value,
            reason: classifyFailure(error),
            error,
          });
        }
        await this.consumer.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
      },
    });
  }

  async stop() {
    await this.consumer.disconnect();
  }
}

function classifyFailure(error: unknown) {
  if (error instanceof Error && error.message.includes("Invalid telemetry event")) return "telemetry.validation";
  if (error instanceof Error && error.message.includes("command result")) return "command-result.validation";
  return "telemetry.processing";
}
