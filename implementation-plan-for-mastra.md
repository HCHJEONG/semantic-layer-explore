# TASK: Minimal "Explain Why" Causal Trace for Workspace Actions

Repository:
HCHJEONG/semantic-layer-explore

Goal:
Add a minimal, working "Explain Why" feature for explainable system action events.

The feature should answer:

  "Why did this application action happen?"

Example:

  Temperature Sensor reports 34°C
      ↓
  Rule "temperature > 30°C" matches
      ↓
  Fan ON command executes
      ↓
  User clicks [Explain Why]
      ↓
  Ask AI shows a verified explanation

This is an MVP. Prefer small, clear changes over a broad architecture expansion.

==================================================
0. INSPECT FIRST
==================================================

Before editing, inspect the current repository.

At minimum inspect:

- package.json
- README.md
- READMEKor.md
- domain/*
- runtime/*
- db/schema*
- lib/*
- app/api/ask/route.ts
- app/api/ai/chat/route.ts
- app/api/events/*
- app/api/rules/*
- app/api/devices/*
- Workspace Dashboard UI
- Event Timeline UI
- Ask AI UI/tab
- current tab/navigation state

Do not rely on previous assumptions.

Preserve existing behavior.

==================================================
1. NON-NEGOTIABLE ARCHITECTURE RULES
==================================================

- LLMs must not access SQLite or hardware directly.
- LLMs must not execute device commands.
- Explain Why is read-only.
- Existing Ask AI behavior must continue working.
- Existing simulator, rules, devices, event timeline, and APIs must continue working.
- Do not introduce a new top-level page.
- Do not perform broad refactors.

==================================================
2. MVP USER FLOW
==================================================

User flow:

  Workspace Dashboard
      ↓
  Event Timeline
      ↓
  Explainable action event
      ↓
  [Explain Why]
      ↓
  Switch to existing Ask AI tab
      ↓
  Ask AI Explain Mode
      ↓
  Show causal trace + evidence-grounded explanation

The frontend must pass only minimal context:

  {
    mode: "explain",
    eventId: "..."
  }

Do not pass a prewritten explanation from the frontend.

Bad:

  "Explain why the fan turned on because temperature was 34°C."

Good:

  eventId only.

==================================================
3. EVENT TIMELINE ENTRY POINT
==================================================

Add [Explain Why] only to events that represent application/system actions.

Likely eligible events:

- device command events;
- rule-triggered device actions;
- system-generated action events with enough provenance.

Do not add Explain Why to raw sensor reading events.

Good:

  Fan → ON [Explain Why]

Bad:

  Temperature Sensor = 34°C [Explain Why]

Reason:
The app may know why it turned on the fan, but it probably does not know why
the room temperature became 34°C.

==================================================
4. MINIMAL CAUSAL TRACE BUILDER
==================================================

Add a small deterministic causal trace function/module.

Input:

  eventId

Output:

  a structured trace describing what the application can prove.

The exact schema should fit the current repository, but it should roughly include:

  {
    eventId,
    explainable: true | false,
    completeness: "complete" | "partial" | "insufficient",
    selectedEvent,
    triggerReading?,
    matchedRule?,
    ruleEvent?,
    deviceExecution?,
    resultingState?,
    missing: [],
    evidence: []
  }

Important:
The deterministic trace is the source of truth.

Do not let the LLM invent missing causal steps.

==================================================
5. PROVENANCE RULE
==================================================

Prefer explicit identifiers:

- eventId
- ruleId
- deviceId
- sensorId
- triggerEventId
- sourceEventId
- correlationId

If current events already contain useful provenance, reuse it.

If they do not, make the smallest reasonable change so future events include
provenance.

Do not redesign the event system.

Legacy events without enough provenance should produce a partial trace.

Do not infer a complete causal chain from timestamp proximity alone.

Timestamp proximity may be used only as weak/derived evidence, and only if the
result clearly marks it as uncertain.

==================================================
6. EVIDENCE STRENGTH
==================================================

Each causal claim should be marked with simple support strength:

- "proven"
- "derived"
- "insufficient"

Examples:

Proven:
  The selected event records that Fan A received ON command.

Derived:
  A rule match event and device command share the same correlationId.

Insufficient:
  No trigger sensor reading is linked to this action.

Partial traces are acceptable.

Never fabricate missing evidence.

==================================================
7. MINIMAL API
==================================================

Add a dedicated endpoint:

  POST /api/ai/explain-event

Input:

  {
    eventId: string
  }

Flow:

1. Validate input.
2. Load selected event through existing app/runtime/data boundaries.
3. Check whether the event is explainable.
4. Build deterministic causal trace.
5. Produce a structured explanation.
6. Return JSON.

Initial MVP may produce the final explanation using deterministic formatting
only.

If existing AI provider conventions are easy to reuse, the endpoint may call
the LLM only after the deterministic trace is built.

The LLM must receive only structured evidence, not direct database access.

==================================================
8. MASTRA: MINIMAL OPTIONAL INTEGRATION
==================================================

Mastra is optional for this MVP unless it is already installed or can be added
with very low risk.

Current implementation:

- `lib/causal-trace.ts` owns deterministic evidence reconstruction.
- `lib/explain-workflow.ts` owns the Mastra workflow boundary.
- `/api/ai/explain-event` calls `runExplainEventWorkflow(eventId)`.
- Ask AI renders workflow stages, prepared agent findings, evidence, and critic output.
- `@mastra/core@1.59.0` is installed.
- The first Mastra pass uses deterministic workflow steps, not live LLM agents.

This means Mastra should be introduced by replacing or wrapping the internals of
`runExplainEventWorkflow`, not by changing the dashboard entry point or API
response shape.

Before adding Mastra:

- inspect package.json;
- verify compatibility with current Next.js and Node runtime;
- avoid large dependency churn.
- current installed package: `@mastra/core@1.59.0`.

Current minimal Mastra workflow:

  deterministic causal trace
      ↓
  evidence review + critic workflow step
      ↓
  final structured explanation

Do not build a large multi-agent system until the deterministic workflow is
stable.

Do not add three role-play agents unless there is a real bounded evidence split.

If Mastra integration is risky or time-consuming, defer it and document that the
MVP uses deterministic trace + structured explanation first.

==================================================
9. ASK AI EXPLAIN MODE
==================================================

Reuse the existing Ask AI tab/UI.

Add a temporary Explain Mode entered from the Event Timeline.

Explain Mode should:

- show that the user is explaining a selected event;
- automatically request `/api/ai/explain-event`;
- show loading state;
- render the returned causal trace and explanation;
- allow returning to Workspace if the current navigation model supports it.

Example UI:

  ASK AI · EXPLAIN MODE
  Source event: evt-284

  Why did Fan A turn on?

  Causal Trace:
  Temperature Sensor A reported 34°C
      ↓
  Rule "High Temperature" matched: 34°C > 30°C
      ↓
  Fan A received ON command

  Explanation:
  Fan A turned on because the application recorded a rule-triggered action:
  Temperature Sensor A reported 34°C, which satisfied the rule threshold of
  temperature > 30°C, and the resulting device command set Fan A to ON.

  Evidence:
  - sensor event evt-281
  - rule event evt-282
  - device command event evt-284

For partial traces, show missing evidence clearly.

Example:

  This explanation is partial. The selected device command was found, but no
  linked trigger sensor reading was recorded.

Do not expose hidden chain-of-thought.

==================================================
10. NORMAL ASK AI MUST REMAIN UNCHANGED
==================================================

Normal Ask AI mode should behave as it does now.

Explain Mode should be activated only when launched with explain context.

Do not replace the existing chat behavior.

==================================================
11. READ-ONLY SAFETY TEST
==================================================

Explain Why must not mutate runtime state.

It must never:

- create rules;
- update rules;
- enable or disable rules;
- issue device commands;
- change simulator state;
- mutate ontology;
- alter device state.

The endpoint should be read-only.

==================================================
12. MINIMAL TESTING
==================================================

Add focused tests for deterministic behavior.

Prioritize:

- explainable vs non-explainable event detection;
- successful trace reconstruction when provenance exists;
- partial trace when provenance is missing;
- evidence strength classification;
- API rejects invalid eventId;
- Explain Why does not mutate state;
- normal Ask AI still works, if there are existing tests around it.

Do not assert exact natural-language wording.

Assert structured fields instead.

==================================================
13. MINIMAL EVALUATION HARNESS
==================================================

Add only a small deterministic evaluation harness if it fits naturally.

Suggested:

  evals/
    causal-trace-cases.ts
    run-causal-trace-eval.ts

Use 3-5 deterministic cases, not a large benchmark.

Measure only objective fields:

- selected event recognized;
- trigger sensor identified;
- matched rule identified;
- target device identified;
- command identified;
- completeness classification correct;
- unsupported claims absent.

Do not claim generic "AI accuracy."

Live LLM/Mastra eval is optional and should not run by default.

==================================================
14. DOCUMENTATION
==================================================

Update both:

- README.md
- READMEKor.md

Document:

- what Explain Why does;
- that it explains application-level causality only;
- that it is read-only;
- that partial traces are possible when provenance is missing;
- how to run relevant tests/evals if added.

Keep documentation concise.

==================================================
15. IMPLEMENTATION PRIORITY
==================================================

Implement in this order:

1. Inspect current event/domain/runtime model.
2. Define minimal causal trace contract.
3. Add deterministic trace builder.
4. Add `/api/ai/explain-event`.
5. Add [Explain Why] button only for eligible events.
6. Wire button to Ask AI Explain Mode.
7. Render trace, evidence, explanation, and missing evidence.
8. Add focused tests.
9. Update README.md and READMEKor.md.
10. Add tiny eval harness only if low-risk.

==================================================
16. ACCEPTANCE CRITERIA
==================================================

The feature is complete when:

- eligible action events show [Explain Why];
- clicking [Explain Why] switches to Ask AI;
- Ask AI Explain Mode runs automatically;
- backend reconstructs causality deterministically;
- explanation is grounded in returned evidence;
- missing evidence is shown as partial/insufficient, not invented;
- normal Ask AI still works;
- Explain Why performs no mutations;
- focused tests pass;
- docs are updated.

Avoid broad refactors.

Prefer the smallest implementation that cleanly proves the flow end to end.
