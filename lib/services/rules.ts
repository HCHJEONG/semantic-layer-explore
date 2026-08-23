import "server-only";

import type { RuleInput } from "@/domain/rule";
import { getInternalApiUrl } from "@/lib/server/internal-api";
import { InputValidationError } from "@/lib/server/validation";

export async function validateRuleTargets(input: RuleInput) {
  const [sensorsResponse, devicesResponse] = await Promise.all([
    fetch(getInternalApiUrl("/api/sensors"), { cache: "no-store" }),
    fetch(getInternalApiUrl("/api/devices"), { cache: "no-store" }),
  ]);
  if (!sensorsResponse.ok || !devicesResponse.ok) throw new Error("Operational target lookup failed");
  const sensors = await sensorsResponse.json() as Array<{ id: string; unit: string }>;
  const devices = await devicesResponse.json() as Array<{ id: string; type: string }>;
  const sensor = sensors.find((item) => item.id === input.condition.sensorId);
  const device = devices.find((item) => item.id === input.action.deviceId);
  if (!sensor) throw new InputValidationError(`Unknown or disabled sensor: ${input.condition.sensorId}`);
  if (!device) throw new InputValidationError(`Unknown or disabled device: ${input.action.deviceId}`);
  if (sensor.unit !== input.condition.unit) throw new InputValidationError(`Sensor ${sensor.id} uses ${sensor.unit}, not ${input.condition.unit}.`);
  const allowedCommands: Record<string, string[]> = { led: ["on", "off"], relay: ["on", "off"], servo: ["set-angle", "off"], buzzer: ["beep", "off"] };
  if (!allowedCommands[device.type]?.includes(input.action.command)) throw new InputValidationError(`${input.action.command} is not allowed for ${device.type}.`);
  if (input.action.command === "set-angle" && (input.action.value === undefined || input.action.value < 0 || input.action.value > 180)) {
    throw new InputValidationError("Servo angle must be between 0 and 180.");
  }
}
