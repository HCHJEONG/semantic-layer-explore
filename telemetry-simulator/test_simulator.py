import json
import os
import unittest
from unittest.mock import patch

from simulator import WorkspaceTelemetrySimulator


class CommandSimulatorTest(unittest.TestCase):
    def test_default_command_failure_rate_is_one_percent(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            simulator = WorkspaceTelemetrySimulator()
        self.assertEqual(simulator.command_failure_rate, 0.01)

    def test_command_ack_is_idempotent(self) -> None:
        command = {"schemaVersion": "command.v1", "commandId": "command-1", "deviceId": "relay-fan-01", "command": "on", "issuedAt": "2026-08-23T00:00:00Z"}
        simulator = WorkspaceTelemetrySimulator()
        first = simulator.handle_command("devices/relay-fan-01/commands", json.dumps(command).encode())
        second = simulator.handle_command("devices/relay-fan-01/commands", json.dumps(command).encode())
        self.assertEqual(first, second)
        self.assertEqual(first[1]["state"]["status"], "on")

    def test_failure_rate_produces_negative_ack(self) -> None:
        with patch.dict(os.environ, {"SIM_COMMAND_FAILURE_RATE": "1"}):
            simulator = WorkspaceTelemetrySimulator()
        command = {"schemaVersion": "command.v1", "commandId": "command-2", "deviceId": "led-01", "command": "on", "issuedAt": "2026-08-23T00:00:00Z"}
        result = simulator.handle_command("devices/led-01/commands", json.dumps(command).encode())
        self.assertFalse(result[1]["success"])
        self.assertEqual(result[1]["error"], "simulated device failure")


if __name__ == "__main__":
    unittest.main()
