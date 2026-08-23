import { Injectable, Logger } from "@nestjs/common";
import type { CommandResult } from "../contracts/command-result.js";
import { PostgresService } from "../persistence/postgres-service.js";

@Injectable()
export class CommandResultService {
  private readonly logger = new Logger(CommandResultService.name);
  constructor(private readonly postgres: PostgresService) {}

  async handle(result: CommandResult) {
    const outcome = await this.postgres.applyCommandResult(result);
    if (outcome.duplicate) this.logger.warn(`duplicate command result skipped: ${result.commandId}`);
    else this.logger.log(`command ${result.commandId} ${result.success ? "succeeded" : "failed"} for ${result.deviceId}`);
  }
}
