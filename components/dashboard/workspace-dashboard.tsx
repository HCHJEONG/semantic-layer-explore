"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, BellRing, Fan, Gauge, Lightbulb, Play, Radio, RefreshCw, Ruler, Thermometer, ToggleLeft, Zap } from "lucide-react";
import type { DeviceState, DeviceType, SensorReading, SensorType, SimulatorScenario } from "@/domain/physical";
import type { RuleRecord } from "@/domain/rule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type WorkspaceState = {
  mode: "simulator";
  connection: { state: "connected" | "disconnected"; adapter: string };
  simulator: { running: boolean; scenario: SimulatorScenario; intervalMs: number };
  sensors: Array<{ id: string; name: string; type: SensorType; unit: string }>;
  readings: SensorReading[];
  devices: Array<{ id: string; name: string; type: DeviceType; state: DeviceState }>;
};

type WorkspaceEvent = {
  id: number;
  eventId: string;
  type: string;
  sourceType: string;
  sourceId: string;
  payload: unknown;
  occurredAt: string;
};

const scenarios: Array<{ id: SimulatorScenario; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "high-temperature", label: "High temp" },
  { id: "dark-room", label: "Dark room" },
  { id: "object-approaching", label: "Near object" },
  { id: "button-pressed", label: "Button" },
];

const sensorIcons = { temperature: Thermometer, light: Lightbulb, distance: Ruler, button: ToggleLeft };
const deviceIcons = { led: Lightbulb, servo: Gauge, buzzer: BellRing, relay: Fan };

function readingLabel(reading: SensorReading | undefined) {
  if (!reading) return "—";
  if (typeof reading.value === "boolean") return reading.value ? "Pressed" : "Released";
  const suffix = { celsius: "°C", lux: " lux", centimeter: " cm", boolean: "" }[reading.unit];
  return `${reading.value}${suffix}`;
}

function eventDescription(event: WorkspaceEvent, rules: RuleRecord[]) {
  if (event.type === "sensor.reading") return `${event.sourceId} reported a new reading`;
  if (event.type === "rule.matched") return `${rules.find((rule) => rule.id === event.sourceId)?.name ?? "Automation rule"} matched`;
  if (event.type === "device.command.succeeded") return `${event.sourceId} accepted a device command`;
  if (event.type === "device.command.failed") return `${event.sourceId} rejected a device command`;
  if (event.type === "simulator.scenario") return `Scenario changed to ${event.sourceId}`;
  return event.type.replaceAll(".", " ");
}

function deviceStateLabel(device: WorkspaceState["devices"][number]) {
  if (device.type === "servo") return `${device.state.angle ?? 90}°`;
  if (device.type === "buzzer") return "Beep";
  return device.state.status;
}

export function WorkspaceDashboard() {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [stateResponse, eventsResponse, rulesResponse] = await Promise.all([
        fetch("/api/state", { cache: "no-store" }),
        fetch("/api/events?limit=40", { cache: "no-store" }),
        fetch("/api/rules", { cache: "no-store" }),
      ]);
      if (!stateResponse.ok || !eventsResponse.ok || !rulesResponse.ok) throw new Error("Workspace runtime is unavailable.");
      const [nextState, nextEvents, nextRules] = await Promise.all([stateResponse.json(), eventsResponse.json(), rulesResponse.json()]);
      setState(nextState); setEvents(nextEvents); setRules(nextRules); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Workspace runtime is unavailable."); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  async function runScenario(scenario: SimulatorScenario) {
    setBusy(scenario);
    try {
      const response = await fetch(`/api/simulator/scenarios/${scenario}`, { method: "POST" });
      if (!response.ok) throw new Error("Could not run the simulator scenario.");
      setState(await response.json());
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Scenario failed."); }
    finally { setBusy(""); }
  }

  async function toggleDevice(device: WorkspaceState["devices"][number]) {
    if (device.type === "servo") return;
    setBusy(device.id);
    try {
      const command = device.type === "buzzer" ? "beep" : device.state.status === "on" ? "off" : "on";
      const response = await fetch(`/api/devices/${device.id}/commands`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command }),
      });
      if (!response.ok) throw new Error("The virtual device rejected the command.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Device command failed."); }
    finally { setBusy(""); }
  }

  const matchedEvents = events.filter((event) => event.type === "rule.matched");

  return <section className="dashboard-page">
    <div className="dashboard-hero">
      <div><span className="eyebrow">BESTAICOM OPERATIONS LAYER</span><h1>Operational Workspace Overview</h1><p>BestAiCom connects field signals, business meaning, and approved automation through one inspectable control layer.</p></div>
      <div className="runtime-pill"><i className={state?.connection.state === "connected" ? "online" : ""} /><span>{state?.mode ?? "loading"}</span><strong>{state?.connection.state ?? "connecting"}</strong></div>
    </div>

    <div className="dashboard-metrics">
      <Card className="metric"><Radio /><span>Adapter<strong>{state?.connection.adapter ?? "—"}</strong></span></Card>
      <Card className="metric"><Activity /><span>Sensors<strong>{state?.readings.length ?? 0} / {state?.sensors.length ?? 4} live</strong></span></Card>
      <Card className="metric"><Zap /><span>Active rules<strong>{rules.filter((rule) => rule.enabled).length}</strong></span></Card>
      <Card className="metric"><RefreshCw /><span>Rule matches<strong>{matchedEvents.length} recent</strong></span></Card>
    </div>

    <div className="dashboard-grid">
      <div className="dashboard-main">
        <Card className="dashboard-panel">
          <CardHeader className="dashboard-title"><div><span className="eyebrow">LIVE TELEMETRY</span><CardTitle>Sensors</CardTitle></div><small>Updates every 2 seconds</small></CardHeader>
          <CardContent className="p-4"><div className="sensor-grid">{state?.sensors.map((sensor) => {
            const Icon = sensorIcons[sensor.type];
            const reading = state.readings.find((item) => item.sensorId === sensor.id);
            return <article className={`sensor-card ${sensor.type}`} key={sensor.id}><div className="card-icon"><Icon /></div><div><span>{sensor.name}</span><strong>{readingLabel(reading)}</strong><small>{reading ? new Date(reading.measuredAt).toLocaleTimeString() : "Waiting for data"}</small></div></article>;
          }) ?? <div className="loading-lines">Connecting to sensors…</div>}</div></CardContent>
        </Card>

        <Card className="dashboard-panel">
          <CardHeader className="dashboard-title"><div><span className="eyebrow">ACTUATORS</span><CardTitle>Virtual Devices</CardTitle></div><small>Manual commands are audited</small></CardHeader>
          <CardContent className="p-4"><div className="device-grid">{state?.devices.map((device) => {
            const Icon = deviceIcons[device.type];
            return <Button key={device.id} variant="outline" className={`device-card ${device.state.status}`} disabled={busy === device.id || device.type === "servo"} onClick={() => void toggleDevice(device)}><Icon /><span>{device.name}<small>{device.type}</small></span><strong>{deviceStateLabel(device)}</strong></Button>;
          })}</div></CardContent>
        </Card>

        <Card className="dashboard-panel">
          <CardHeader className="dashboard-title"><div><span className="eyebrow">SIMULATOR PRESETS</span><CardTitle>Scenario Controls</CardTitle></div><small>{state?.simulator.running ? `Running · ${state.simulator.intervalMs} ms` : "Stopped"}</small></CardHeader>
          <CardContent className="p-4"><div className="scenario-row">{scenarios.map((scenario) => <Button key={scenario.id} variant={state?.simulator.scenario === scenario.id ? "secondary" : "outline"} disabled={Boolean(busy)} onClick={() => void runScenario(scenario.id)}><Play />{scenario.label}</Button>)}</div></CardContent>
        </Card>
      </div>

      <Card className="timeline-panel">
        <CardHeader className="dashboard-title"><div><span className="eyebrow">AUDIT TRAIL</span><CardTitle>Event Timeline</CardTitle></div><span className="live-label"><i />LIVE</span></CardHeader>
        <CardContent className="p-5"><div className="timeline">{events.length ? events.map((event) => <article key={event.eventId} className={event.type === "rule.matched" ? "matched" : ""}><time>{new Date(event.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><i /><div><strong>{eventDescription(event, rules)}</strong><span>{event.type}</span></div></article>) : <div className="empty">Events will appear as the simulator runs.</div>}</div></CardContent>
      </Card>
    </div>
    {error && <div className="error toast">{error}</div>}
  </section>;
}
