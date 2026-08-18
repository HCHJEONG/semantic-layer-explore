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
- Ask AI renders the Mastra graph with `@xyflow/react`.
- `@mastra/core@1.59.0` is installed.
- The first Mastra pass uses deterministic workflow steps, not live LLM agents.
- `lib/llm/provider.ts` defines a model-agnostic LLM provider interface.
- `lib/llm/gemini-provider.ts` adapts the existing `lib/gemini.ts` Vertex Gemini client to that interface.
- Mastra does not call the LLM adapter yet; this is the preparation for the next step.

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

Next LLM step:

- add Explain Why-specific review helpers that call `getLlmProvider()`;
- guard live LLM review behind `EXPLAIN_LLM_REVIEW=enabled`;
- keep deterministic review as the default test-safe fallback.

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

==================================================
17. NEXT ARCHITECTURE WORK: LLM, DB, MASTRA
==================================================

The next work should be planned around three related architecture tracks:

1. LLM provider adapter
2. DB/store interface boundary
3. Mastra LLM evidence agents

These should not be implemented in a random order. The safest order is:

  LLM adapter consistency
      ↓
  DB/store boundary
      ↓
  Mastra LLM review agents

Reason:

- Mastra agents should not import Gemini directly.
- Mastra causal trace steps should not depend on SQLite-specific query methods.
- The deterministic causal trace must remain the source of truth even after LLM
  review is added.
- Basic tests must continue to run without live LLM credentials or network cost.

==================================================
18. LLM ADAPTER TRACK
==================================================

Current state:

- `lib/gemini.ts` is a Gemini-specific low-level wrapper.
- `lib/llm/provider.ts` defines a model-agnostic provider interface.
- `lib/llm/gemini-provider.ts` adapts the existing Gemini wrapper.
- Existing app routes no longer call `getGeminiClient()` or `getGeminiModel()` directly.
- `app/api/ai/chat/route.ts` now uses `getLlmProvider().generateWithTools(...)`.
- `app/api/ai/rules/propose/route.ts` now uses `getLlmProvider()` for forced tool calls and structured proposal generation.
- `app/api/ask/route.ts` now uses `getLlmProvider().generateWithTools(...)`.
- `app/api/ready/route.ts` now exposes provider-neutral `llm` readiness while preserving the legacy `gemini` field for compatibility.
- `lib/ai-tool-layer.ts` now exposes provider-neutral JSON schema-like tool declarations instead of importing Gemini `Type`.
- `lib/llm/gemini-provider.ts` normalizes those tool schemas into Gemini's expected function declaration shape internally.

Target state:

- Application AI code calls `getLlmProvider()`.
- Gemini-specific request/response shapes stay inside `lib/llm/gemini-provider.ts`
  or lower-level `lib/gemini.ts`.
- Provider-neutral tool declarations stay outside Gemini-specific code.
- Future providers can be added without changing Mastra workflow or route logic.

Required provider capabilities:

- `generateText(...)`
- `generateStructured(...)`
- `generateWithTools(...)`

`generateWithTools(...)` is required before migrating existing Ask AI and Rule
Compiler routes because they rely on function calling.

Minimal steps:

1. Extend `LlmProvider` with provider-neutral tool-call types.
2. Implement `generateWithTools(...)` in the Gemini adapter using the existing
   Gemini function-calling format.
3. Migrate `app/api/ai/chat/route.ts` first because it already uses
   `lib/ai-tool-layer.ts`. Completed.
4. Migrate `app/api/ai/rules/propose/route.ts` next. Completed.
5. Migrate legacy `app/api/ask/route.ts` last, or leave it as legacy if it is
   intentionally retained only for comparison. Completed.
6. Update `/api/ready` to expose provider-neutral readiness. Completed:

   {
     llm: {
       provider: "gemini",
       configured: true,
       model: "gemini-3.5-flash-lite"
     }
   }

Compatibility rule:

- Do not remove existing Gemini helpers until all direct route imports are gone.
- Preserve `GEMINI_MODEL` for the current provider.
- Add `LLM_PROVIDER=gemini` as the default provider selector.

==================================================
19. DB / STORE BOUNDARY TRACK
==================================================

Current state:

- DB connection is centralized in `db/index.ts`.
- The implementation is still SQLite-specific:
  - `better-sqlite3`
  - `drizzle-orm/better-sqlite3`
  - `sqliteTable`
  - sync query helpers such as `.get()`, `.all()`, `.run()`
- Query logic is spread across:
  - `runtime/workspace-runtime.ts`
  - several API routes
- Event history access now has a first store boundary:
  - `lib/stores/events-store.ts`
  - `app/api/events/route.ts` uses the event store.
  - `app/api/events/stream/route.ts` uses the event store.
  - `lib/causal-trace.ts` uses the event store and no longer imports `getDb()` or
    `events` directly.
  - `runtime/workspace-runtime.ts` uses the event store for event insertion and
    event listing.
- Rule access now has a store boundary:
  - `lib/stores/rules-store.ts`
  - `lib/rules.ts` keeps rule validation/cache/domain service behavior and calls
    the store.
  - Rule API routes use the async rule service methods.
  - Rule execution in `runtime/workspace-runtime.ts` awaits the async rule
    service boundary.
- Ontology access now has a store boundary:
  - `lib/stores/ontology-store.ts`
  - `lib/ontology.ts` keeps semantic resolution behavior and calls the store.
  - Class, property, and individual creation routes use ontology service/store
    methods instead of importing `getDb()` directly.
- Physical device/sensor persistence now has a store boundary:
  - `lib/stores/physical-store.ts`
  - `runtime/workspace-runtime.ts` uses the physical store for sensor reading
    insertion and device state updates.
- Database infrastructure operations now have a store boundary:
  - `lib/stores/database-store.ts`
  - `app/api/ready/route.ts` uses the database store for readiness checks.
  - `runtime/retention.ts` uses the database store for batched cleanup
    execution.
- Store consumers now use a single factory/export entrypoint:
  - `lib/stores/index.ts`
  - App routes, runtime modules, and domain services import store factories from
    `@/lib/stores`.
- `DB_PROVIDER=sqlite` is documented as the reserved provider selection setting.
  The project still ships only the SQLite implementation.

Target state:

  App / Runtime / Mastra
      ↓
  Store interfaces
      ↓
  Drizzle SQLite implementation now
      ↓
  Drizzle PostgreSQL implementation later

Do not attempt a full SQLite to PostgreSQL migration yet.

First introduce interfaces that hide SQLite-specific access patterns.

Recommended store order:

1. Event store. Completed.
2. Rule store. Completed.
3. Ontology store. Completed.
4. Device/sensor store. Completed.
5. Database infrastructure store. Completed.
6. Store factory/export entrypoint. Completed.

Start with Event store because Explain Why and Mastra causal trace depend on
auditable event history.

Minimal event store interface:

  type EventStore = {
    getEventByEventId(eventId: string): Promise<WorkspaceEvent | null>;
    listEvents(limit: number): Promise<WorkspaceEvent[]>;
    listEventsAfter(id: number, limit: number): Promise<WorkspaceEvent[]>;
    insertEvent(event: NewWorkspaceEvent): Promise<void>;
  };

Important:

- Use async store methods even while SQLite implementation is sync internally.
- That makes PostgreSQL migration less invasive later.
- Keep the SQLite implementation small and close to Drizzle.
- Do not expose `.get()`, `.all()`, `.run()`, or Drizzle table details above the
  store boundary once an area is migrated.

Minimal steps:

1. Add `lib/stores/events-store.ts`. Completed.
2. Move event row parsing and event insert/read logic there.
3. Update `runtime/workspace-runtime.ts`, `app/api/events/route.ts`,
   `app/api/events/stream/route.ts`, and `lib/causal-trace.ts` to use it.
4. Keep behavior identical.
5. Add tests for event listing and causal trace behavior.

Do not split `db/schema.ts` into PostgreSQL and SQLite schemas in the same step.
That is a later migration step after store boundaries are stable.

==================================================
20. MASTRA LLM AGENT TRACK
==================================================

Current state:

- `@mastra/core@1.59.0` is installed.
- `lib/explain-workflow.ts` runs a real Mastra workflow.
- The current Mastra steps are deterministic:

  causal-trace
      ↓
  parallel evidence review
      ├─ sensor-review
      ├─ rule-review
      └─ execution-review
      ↓
  critic

- The evidence review steps can call the LLM adapter only when
  `EXPLAIN_LLM_REVIEW=enabled`.

Target state:

  causal-trace
      ↓
  parallel evidence review
      ├─ sensor-review
      ├─ rule-review
      └─ execution-review
      ↓
  critic
      ↓
  final structured explanation

LLM usage rule:

- LLM review must be opt-in:

  EXPLAIN_LLM_REVIEW=enabled

- If this flag is absent, the workflow must use deterministic review only.
- Default tests must not call a live LLM.

Bounded evidence views:

- Sensor reviewer receives only sensor-related trace/evidence.
- Rule reviewer receives only rule condition/action/match evidence.
- Execution reviewer receives only command/execution/resulting-state evidence.
- Critic receives the deterministic trace plus structured reviewer findings.
- Critic can call the LLM adapter when `EXPLAIN_LLM_REVIEW=enabled`, but final
  critic claims are still constrained by a deterministic verifier that checks
  known evidence IDs and preserves missing evidence.

The LLM must not receive raw DB access, broad event dumps, or hardware access.

Output validation:

- All LLM outputs must be parsed with Zod.
- Unsupported or malformed LLM output should fall back to deterministic findings
  or return a controlled low-confidence/partial result.
- Do not display hidden chain-of-thought.

Minimal steps:

1. Split the current `evidence-review-and-critic` Mastra step into:
   - `sensor-review`
   - `rule-review`
   - `execution-review`
   - `critic`
   Completed.
2. Keep all four steps deterministic first. Completed.
3. Use Mastra `.parallel()` for the three evidence review steps if it fits
   cleanly. Completed.
4. Add `lib/llm/explain-review.ts`. Completed.
5. Behind `EXPLAIN_LLM_REVIEW=enabled`, call `getLlmProvider()` from the review
   helpers. Completed.
6. Keep deterministic fallback as the default path. Completed.

==================================================
21. RECOMMENDED NEXT TWO SMALL STEPS
==================================================

Next step A:

Extend the LLM adapter with `generateWithTools(...)` and migrate only
`app/api/ai/chat/route.ts` to use it.

Why first:

- It makes the LLM adapter real across the existing app, not only future Mastra
  code.
- It proves provider-neutral tool calling with the simplest current route.
- It reduces direct Gemini coupling before adding more LLM usage.

Acceptance:

- `app/api/ai/chat/route.ts` no longer imports `getGeminiClient` or
  `getGeminiModel`. Completed.
- Existing chat behavior remains unchanged.
- `npm run build`, `npm run lint`, and `npm test` pass.

Next step B:

Add the Event store boundary and migrate Explain Why event reads to it.

Why second:

- It reduces SQLite coupling exactly where Mastra depends on event history.
- It prepares future PostgreSQL migration without changing the schema yet.

Acceptance:

- `lib/causal-trace.ts` no longer imports `getDb()` or `events` directly.
- Event API/timeline behavior remains unchanged.
- `npm run build`, `npm run lint`, and `npm test` pass.

Status:

- Completed.

Only after A and B:

- Split Mastra evidence steps.
- Add optional LLM review behind `EXPLAIN_LLM_REVIEW=enabled`.
