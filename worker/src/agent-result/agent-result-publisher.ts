import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Kafka, type Producer } from "kafkajs";
import { config } from "../config.js";

export type AgentResult = {
  schemaVersion: "agent-result.v1";
  resultId: string;
  kind: "explain-event" | "rule-proposal" | "impact-analysis";
  status: "succeeded" | "failed" | "skipped";
  summary?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  correlationId?: string;
  sessionId?: string;
};

@Injectable()
export class AgentResultPublisher implements OnModuleDestroy {
  private readonly kafka = new Kafka({ clientId: `physicalai-worker-agent-result-${config.workerId}`, brokers: config.kafkaBrokers });
  private readonly producer: Producer = this.kafka.producer();
  private connected = false;

  async publish(result: AgentResult) {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
    await this.producer.send({
      topic: config.agentResultTopic,
      messages: [{
        key: result.correlationId ?? result.resultId,
        value: JSON.stringify(result),
        headers: {
          schemaVersion: Buffer.from(result.schemaVersion),
          resultId: Buffer.from(result.resultId),
          kind: Buffer.from(result.kind),
          status: Buffer.from(result.status),
        },
      }],
    });
  }

  async onModuleDestroy() {
    if (this.connected) await this.producer.disconnect();
  }
}
