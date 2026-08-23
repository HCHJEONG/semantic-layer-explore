import { Module } from "@nestjs/common";
import { TelemetryConsumer } from "./consumer/telemetry-consumer.js";
import { TelemetryService } from "./telemetry/telemetry-service.js";
import { PostgresService } from "./persistence/postgres-service.js";
import { AuditService } from "./audit/audit-service.js";
import { MastraDecisionService } from "./mastra/mastra-decision-service.js";
import { DeadLetterService } from "./dead-letter/dead-letter-service.js";
import { AgentResultPublisher } from "./agent-result/agent-result-publisher.js";

@Module({
  providers: [TelemetryConsumer, TelemetryService, PostgresService, AuditService, MastraDecisionService, DeadLetterService, AgentResultPublisher],
})
export class AppModule {}
