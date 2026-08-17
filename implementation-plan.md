# Implementation Plan

## Goal

Build a compact prototype that demonstrates how a manually defined domain contract can be expanded into a working semantic physical workspace. The prototype should make the full path visible: domain model, database schema, runtime orchestration, REST APIs, UI, and AI tool access.

The core handoff principle is:

> The `domain/` folder is the human-authored source of truth. The rest of the implementation should follow that contract.

## Human-authored domain contract

The first implementation step is to manually define the files under `domain/`.

### `domain/physical.ts`

Define the physical workspace vocabulary:

- supported sensor types
- supported sensor units
- supported device types
- supported device commands
- the shape of a sensor reading
- the shape of a device command
- device state, command result, connection status, simulator scenario, and workspace state

This file answers:

- What is a sensor?
- What is a device?
- What is the minimum shared contract for readings and commands?

### `domain/rule.ts`

Define the automation rule contract:

- supported condition operators
- rule condition shape
- rule action shape
- rule input validation
- rule patch validation
- persisted rule record shape

This file answers:

- Which readings can be evaluated as conditions?
- Which device actions can be executed?
- What must be validated before a rule becomes approved automation?

### `domain/ontology.ts`

Define the semantic layer contract:

- classes
- properties
- individuals
- relations
- ontology responses
- ontology item selections

This file answers:

- How should the workspace be described semantically?
- Which concepts and relationships should AI tools inspect before answering or proposing actions?

## Build order after the domain contract

### 1. Database schema

Create `db/schema.ts` from the domain model.

The schema should separate semantic metadata from operational state:

- semantic classes
- semantic properties
- semantic individuals
- semantic relations
- sensors
- devices
- sensor readings
- auditable events
- automation rules

The database design should persist the domain concepts without becoming the place where those concepts are invented.

### 2. Seed data and database access

Create the database initialization and seed path.

Seed data should provide:

- a small business ontology
- physical workspace individuals connected to runtime IDs
- simulator sensors
- simulator devices
- example approved rules when useful for the demo

### 3. Runtime and adapter boundary

Implement a runtime layer that coordinates physical workspace behavior.

The runtime should:

- start and stop the active physical adapter
- expose current workspace state
- persist sensor readings
- persist auditable events
- evaluate enabled rules against incoming readings
- execute device commands when rules match
- keep AI and UI layers away from direct hardware or database access

Implement a simulator adapter first. The adapter should produce deterministic sensor readings and virtual device states while preserving the boundary needed for a future MQTT or hardware adapter.

### 4. Rule engine and rule storage

Implement rule behavior in two parts:

- a pure evaluator that decides whether one rule matches one reading
- a persistence/helper module that creates, updates, enables, disables, deletes, validates, and caches rules

Validation should ensure that a rule targets real enabled sensors and devices, uses the correct unit, and only requests commands supported by the target device type.

### 5. REST API

Expose the domain and runtime through REST endpoints.

The minimum API surface should include:

- ontology read API
- class/property/individual/relation APIs
- current workspace state API
- sensors API
- devices API
- device command API
- simulator control API
- event timeline API
- event stream API
- rule CRUD API
- AI chat and AI rule proposal APIs

REST APIs are the boundary for UI and AI access. Gemini or other AI tools should not access the database directly.

### 6. UI

Build a compact interface that makes the architecture inspectable.

The UI should show:

- ontology browser
- relationship graph
- current sensor readings
- virtual device states and controls
- simulator scenarios
- event timeline
- approved automation rules
- AI rule proposal flow with human approval
- AI chat grounded in ontology, current state, rules, and events

### 7. AI tool layer

Implement an AI tool layer that exposes only safe application-level tools.

The AI should be able to call:

- `getOntology`
- `getCurrentState`
- `getSensors`
- `getDevices`
- `getRecentEvents`
- `getRules`

The AI should inspect ontology first, use REST tool results as evidence, and never claim direct database or hardware access. Rule generation should propose a validated rule only; saving or executing the rule should remain a separate human-approved action.

### 8. Verification

Verify the prototype with:

- production build
- focused rule-engine tests
- API validation tests where useful
- manual simulator scenarios
- manual AI rule proposal and chat checks

## Acceptance criteria

The prototype is complete when:

- the domain contract is the source of truth for shared physical, rule, and ontology concepts
- the database schema persists those concepts cleanly
- the simulator emits sensor readings and updates workspace state
- readings create auditable events
- enabled rules are evaluated against readings
- matched rules execute virtual device commands
- REST APIs expose state, events, devices, simulator controls, rules, and ontology
- AI chat answers only through ontology-first REST tools
- AI rule proposal returns a validated preview without saving it automatically
- the UI makes the full domain-to-runtime-to-AI flow visible

## Non-goals

This prototype should not attempt to implement:

- a full OWL/RDF ontology system
- SPARQL querying
- graph database storage
- enterprise permissions
- production hardware control
- direct AI access to SQLite or hardware
- fully autonomous rule approval

## Handoff note

For this style of project, the most important FDE deliverable is the manually authored `domain/` folder. Once that contract is clear, a PE, PM, or coding agent can expand it into database schema, runtime behavior, APIs, UI, and AI tools with much less ambiguity.

Note: this document is written retrospectively as the implementation plan that could have guided this repository, not as a claim that the project was originally built from this exact file.
