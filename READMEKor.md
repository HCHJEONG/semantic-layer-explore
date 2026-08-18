# BestAiCom Semantic Workspace

[English README](./README.md)

> Minimal Ontology → Database → API → AI Demo

BestAiCom Semantic Workspace는 LLM, REST API, 운영 데이터 사이에 공유된 업무 의미가 어떻게 놓일 수 있는지 보여주는 작고 의도적으로 제한된 포트폴리오 프로젝트입니다. Protégé에서 가져온 세 가지 접근 가능한 개념인 **Class**, **Property**, **Individual**만 빌려와, 한 번에 이해할 수 있을 만큼 compact하게 구현했습니다.

## 왜 만들었나

LLM은 테이블, ERP 필드, CRM 관계가 비즈니스에서 어떤 의미를 갖는지 본질적으로 이해하지 못합니다. 데이터베이스 스키마는 저장 구조를 설명하지만, 업무 의미를 안정적으로 전달하지는 못합니다.

Semantic layer는 그 빠진 계약을 제공합니다. 예를 들어 AI에게 `InspectionTeam`은 `Person`이고, `assignedTo`는 operator와 workspace project를 연결하며, `BestAiCom`은 구체적인 `Company`라는 사실을 알려줍니다. 이 프로젝트는 그 아이디어의 가장 작은 유용한 버전을 구현합니다.

## 아키텍처

```text
Browser
   ↓
Next.js UI
   ↓
Gemini (tool calling)
   ↓
Semantic Layer API (/api/ontology)
   ↓
Entity REST APIs
   ↓
SQLite (Drizzle ORM)
```

Gemini는 SQLite에 직접 접근하지 않습니다. 모든 질문은 `getOntology()`로 시작합니다. 사용 가능한 class, property, relationship을 이해한 뒤에야 Gemini는 필요한 REST resource만 요청합니다.

Physical AI 확장은 같은 경계를 유지하면서 API 아래에 deterministic runtime을 추가합니다.

```text
Simulator Sensor → Sensor Event → Rule Engine → Virtual Device
                                      ↓
                               Auditable Event Log
```

승인된 rule을 평가하고 device command를 실행하는 것은 Gemini가 아니라 rule engine입니다. Simulator는 향후 MQTT/Arduino 연결을 위해 남겨둔 adapter boundary와 같은 경계를 구현합니다.

Workspace Dashboard에는 설명 가능한 action event를 위한 최소 **Explain Why** 흐름도 포함됩니다. Event Timeline에 device command가 나타나면 사용자는 Ask AI Explain Mode로 이동할 수 있습니다. Backend는 먼저 기록된 event에서 application-level causal trace를 deterministic하게 재구성한 뒤, 작은 Mastra workflow로 sensor, rule, execution evidence를 검토하고 structured explanation을 생성합니다. 이 기능은 read-only입니다. Device command를 실행하거나 rule을 바꾸지 않으며, 물리 세계가 왜 특정 sensor reading을 만들었는지는 추론하지 않습니다.

LLM 연동은 provider boundary 뒤에 준비하고 있습니다. `lib/llm/provider.ts`는 model-agnostic interface를 정의하고, `lib/llm/gemini-provider.ts`는 기존 Vertex Gemini client를 그 interface에 맞게 감쌉니다. 이 구조 덕분에 현재 Gemini 3.5 Flash Lite 설정을 유지하면서도 이후 다른 provider로 교체할 때 Mastra workflow code 변경을 줄일 수 있습니다.

데모는 하나의 SQLite 파일을 사용해 배포를 단순하게 유지하지만, schema는 semantic metadata store와 operational state를 분리합니다. Ontology record는 `semantic_classes`, `semantic_properties`, `semantic_individuals`, `semantic_relations`에 저장되고, runtime state는 `sensors`, `devices`, `sensor_readings`, `events`, `rules`에 저장됩니다.

```text
"Which project is the operations engineer assigned to?"
  → getOntology()
  → recognizes Person —worksFor→ Company
  → getIndividuals()
  → getRelations()
  → "OpsEngineer is assigned to BestAiCom Smart Workspace."
```

## 구현 계획 메모

이런 프로젝트에서는 database schema를 먼저 설계하기보다 domain model을 먼저 정의하는 편이 자연스럽습니다. 데이터베이스는 개념을 저장하는 persistence layer이지, 개념이 처음 발명되는 장소가 아니어야 합니다.

개발 순서는 다음처럼 계획할 수 있습니다.

1. `domain/physical.ts`에서 시작합니다.  
   sensor란 무엇인지, device란 무엇인지, reading과 command의 최소 공유 계약이 무엇인지 정의합니다.
2. 그다음 `domain/rule.ts`를 정의합니다.  
   어떤 reading을 condition으로 평가할 수 있는지, 어떤 device action을 실행할 수 있는지 결정합니다.
3. 그다음 `domain/ontology.ts`를 정의합니다.  
   class, property, individual, relation으로 시스템을 semantic layer에서 설명합니다.
4. 마지막으로 `db/schema.ts`를 설계합니다.  
   domain concept를 persistent table로 매핑합니다.

이 방식은 implementation plan을 시스템의 vocabulary와 behavior에 먼저 맞춘 다음, 그 모델을 storage, runtime orchestration, API, AI tool로 확장하게 해줍니다.

같은 계획은 몇 가지 재사용 가능한 architecture pattern도 보존합니다.

- Physical I/O, database access, LLM provider call은 교체 가능한 adapter 또는 provider boundary 뒤에 둡니다.
- 외부 입력은 runtime boundary에서 검증하고, 가능하면 같은 schema에서 TypeScript type을 추론합니다.
- 빠른 UI rendering을 위해 current state snapshot을 제공하고, 설명과 debugging을 위해 auditable event history를 남깁니다.
- 실시간 운영 update는 WebSocket 없이 cursor 기반 SSE와 heartbeat로 stream합니다.
- Rule evaluation은 pure하게 유지하고, runtime orchestration이 persistence, event, device command를 담당합니다.
- Ontology-first AI tool calling은 prompt만이 아니라 code로 강제하고, AI tool은 database/hardware 직접 접근 대신 REST API를 통하게 합니다.
- AI는 automation을 propose할 수 있지만, approval과 mutation은 별도의 human-controlled action으로 유지합니다.

`domain/` model을 만들기 전에 필요한 ontology 용어 결정은 [`docs/ontology-modeling-notes.md`](./docs/ontology-modeling-notes.md)에 정리해 두었습니다.

완성된 domain model을 기반으로 구체적 개발을 이어가는 retrospective implementation handoff plan은 [`docs/implementation-plan.md`](./docs/implementation-plan.md)를 참고하세요.

## 기능

- 세 열 ontology explorer와 detail view, live JSON
- React Flow 기반 relationship graph
- Sensor, device, reading, rule, event를 위한 physical workspace table과 분리된 namespaced semantic metadata table
- Zod validation이 적용된 read/create REST endpoint
- Ontology-first flow가 강제된 Gemini tool-calling agent
- 방문자별 UTC day 기준 10회 Ask AI 임시 보호
- 자동 Drizzle migration, WAL mode, persistent volume을 지원하는 file-backed SQLite
- Local/AWS 운영을 위한 health 및 readiness endpoint
- Temperature, light, distance, button reading을 생성하는 seeded sensor simulator
- Hardware-neutral adapter 뒤의 virtual LED, Servo, Buzzer, Relay device
- Persistent Sensor/Event audit trail과 deterministic demo scenario
- Bounded latest-state rule evaluation, cached active rules, batched data retention cleanup
- Validated Rule CRUD, deterministic operator evaluation, per-rule cooldown
- Sensor Event → Rule match → Virtual Device execution으로 이어지는 auditable outcome
- Live sensor card, device control, deterministic demo scenario, event timeline을 보여주는 polling-based workspace dashboard
- Eligible device-command event에 대한 Explain Why, deterministic causal trace, provenance가 부족할 때 partial explanation 제공
- Ontology/sensor/device tool call, validated JSON preview, explicit human approval gate를 갖춘 Gemini Rule Compiler
- Current state, approved rules, recent events에 grounded된 Physical Workspace Chat
- `Sensor → Event → Rule → Device`를 보여주고 runtime ID를 semantic Individual에 binding하는 확장 physical ontology
- Original business demo와 Physical Workspace relationship 모두를 위한 data-driven React Flow layout
- Responsive portfolio-ready interface

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/classes` | Class 목록 조회 또는 생성 |
| `GET`, `POST` | `/api/properties` | Property 목록 조회 또는 생성 |
| `GET`, `POST` | `/api/individuals` | Individual 목록 조회 또는 생성 |
| `GET` | `/api/relations` | Resolved relationship 목록 조회 |
| `GET` | `/api/ontology` | 전체 semantic layer 반환 |
| `POST` | `/api/ask` | Gemini에게 ontology-aware question 질의 |
| `GET` | `/api/health` | 가벼운 process health check |
| `GET` | `/api/ready` | Database 및 runtime readiness check |
| `GET` | `/api/state` | 현재 simulated workspace snapshot |
| `GET` | `/api/sensors` | 최신 reading이 포함된 sensor 목록 |
| `GET` | `/api/devices` | Virtual device state 목록 |
| `POST` | `/api/devices/:id/commands` | 검증된 virtual-device command 실행 |
| `GET` | `/api/events` | Physical workspace event timeline 조회 |
| `GET`, `POST` | `/api/rules` | 검증된 automation rule 목록 조회 또는 생성 |
| `GET`, `PATCH`, `DELETE` | `/api/rules/:id` | Rule 조회, 수정, 삭제 |
| `POST` | `/api/rules/:id/enable` | Rule 활성화 |
| `POST` | `/api/rules/:id/disable` | Rule 비활성화 |
| `GET`, `POST` | `/api/simulator/*` | Simulator 조회 및 제어 |
| `POST` | `/api/ai/rules/propose` | Gemini로 검증된 rule을 제안하되 저장하지 않음 |
| `POST` | `/api/ai/chat` | Ontology-first tool을 통해 workspace state와 event 설명 |
| `POST` | `/api/ai/explain-event` | 설명 가능한 단일 event에 대해 read-only causal trace 생성 |

## 로컬 개발

요구사항: Node.js 22.13+ 및 기존 `lawvot` setup과 호환되는 Google Cloud Application Default Credentials.

```bash
npm install
npm run dev
```

Gemini는 `lawvot`와 같은 environment convention을 따릅니다.

```dotenv
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash-lite
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
DATABASE_PATH=./data/ai-workspace.sqlite
DB_PROVIDER=sqlite
EXPLAIN_LLM_REVIEW=disabled
READING_RETENTION_DAYS=1
AUDIT_EVENT_RETENTION_DAYS=30
RETENTION_CLEANUP_INTERVAL_MS=3600000
RETENTION_BATCH_SIZE=5000
```

Google Cloud project는 service account JSON의 `project_id`에서 읽습니다. `GOOGLE_CLOUD_PROJECT`는 optional override로 남아 있습니다. Gemini model의 configuration source는 `GEMINI_MODEL` 하나이며, 기본값은 `gemini-3.5-flash-lite`입니다.

`DB_PROVIDER`는 현재 `sqlite`로 문서화만 해두었습니다. 아직 두 번째 DB 구현을 추가하지 않고, 나중에 PostgreSQL 또는 MariaDB store provider를 붙일 때 사용할 설정 이름을 미리 고정해 둔 것입니다. `EXPLAIN_LLM_REVIEW=enabled`를 설정하면 Mastra evidence review step들이 앱 전체 LLM adapter를 통해 live LLM review를 수행합니다.

Runtime은 high-volume sensor reading과 matching `sensor.reading` event를 7일 동안 보존하고, low-volume audit event는 30일 동안 보존합니다. Cleanup은 startup 및 hourly schedule로 bounded batch 단위 실행되어 SQLite를 독점하지 않습니다. 삭제된 page는 SQLite가 재사용하며, scheduler는 live traffic을 block할 수 있는 `VACUUM`을 의도적으로 실행하지 않습니다. Rule evaluation은 serialized되고 sensor별 최신 pending reading만 유지하여 device execution이 느릴 때 unbounded async backlog를 방지합니다.

## AWS 배포 형태

이 repository는 `.fordeploy/deploy.sh`에 source-archive 기반 AWS deployment example을 의도적으로 유지합니다. `global-ai-pricing`, `legacy-lang-intelligence` 같은 sibling project와 달리 local에서 Docker image를 build해 image tar를 AWS로 보내지 않습니다. 대신 source tree를 package하고, Bastion host를 통해 source archive를 전송한 뒤 private EC2 instance에서 Docker image를 build합니다.

```text
local machine
  -> create ai-workspace-source.xxxxxx.tar.gz
  -> scp source archive to Bastion EC2
  -> Bastion scp source archive to private EC2
  -> private EC2 extracts the source into a temporary build directory
  -> private EC2 runs docker build
  -> private EC2 replaces the ai-physical-workspace container
```

Source archive는 `.git`, `node_modules`, `.next`, `data`를 제외하므로 upload가 작고 persistent SQLite volume이 deployment로 교체되지 않습니다. `npm run build`를 포함한 Docker build는 private EC2 instance에서 실행됩니다. 이 방식은 local-build/image-tar pattern과 의도적으로 다르며, remote build example이 유용한 future project를 위한 reference deployment style로 남겨둔 것입니다.

## 프로젝트 철학

이 프로젝트는 Protégé clone이 아닙니다. OWL, RDF, SPARQL, reasoning, ontology import/export, permission, graph database는 의도적으로 구현하지 않습니다. 목적은 교육용입니다. **Semantic Layer → API → Gemini → UI** 흐름을 visible하고 inspectable하게 만들어 interview에서 쉽게 설명할 수 있게 하는 것입니다.

## 향후 작업

OWL import, RDF export, reasoner, Neo4j/GraphDB, Palantir-style ontology modeling, MCP server, enterprise semantic layer, natural-language workflow, role-based action은 숨겨진 scope가 아니라 future direction으로 남겨둡니다.

## 스택

Next.js 16 standalone · TypeScript · Tailwind CSS · shadcn-style UI primitives · SQLite · Drizzle ORM · React Flow · Zod · Google Gemini
