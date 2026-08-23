# BestAiCom Semantic Workspace

[English README](./README.md)

> Minimal Ontology → Database → API → AI Demo

BestAiCom Semantic Workspace는 LLM, REST API, 운영 데이터 사이에 공유된 업무 의미가 어떻게 놓일 수 있는지 보여주는 작고 의도적으로 제한된 포트폴리오 프로젝트입니다. Protégé에서 가져온 세 가지 접근 가능한 개념인 **Class**, **Property**, **Individual**만 빌려와, 한 번에 이해할 수 있을 만큼 compact하게 구현했습니다.

## 왜 만들었나

LLM은 테이블, ERP 필드, CRM 관계가 비즈니스에서 어떤 의미를 갖는지 본질적으로 이해하지 못합니다. 데이터베이스 스키마는 저장 구조를 설명하지만, 업무 의미를 안정적으로 전달하지는 못합니다.

Semantic layer는 그 빠진 계약을 제공합니다. 예를 들어 AI에게 `InspectionTeam`은 `Person`이고, `assignedTo`는 operator와 workspace project를 연결하며, `BestAiCom`은 구체적인 `Company`라는 사실을 알려줍니다. 이 프로젝트는 그 아이디어의 가장 작은 유용한 버전을 구현합니다.

## 분산 Physical AI 확장

루트 Next.js 애플리케이션은 대량 telemetry를 처리하는 polyglot distributed
system의 UI와 얇은 BFF입니다. PostgreSQL이 유일한 authoritative store이고,
Neo4j는 재생성 가능한 projection입니다.

```text
HTTP telemetry
  -> Go Gateway
  -> Kafka telemetry.raw (6 partitions)
  -> NestJS worker x N (하나의 consumer group)
  -> PostgreSQL authoritative operational store
```

목표 device 및 graph 경로는 이를
`MQTT -> Go -> Kafka -> worker x N -> PostgreSQL`과
`Kafka -> Rust graph worker -> Neo4j`로 확장합니다.

이 구조는 데이터 양이 증가할 때 각 영역을 독립적으로 확장하기 위한 것입니다.

- Go Gateway instance를 늘려 ingress 경계를 독립적으로 확장할 수 있습니다.
- Kafka partition이 같은 device key의 순서를 보존하면서 stream을 분산합니다.
- 동일한 worker image를 수평 확장하면 Kafka가 consumer-group member에 partition을
  배분합니다.
- PostgreSQL은 operational source of truth이며 application container와 별도로
  확장합니다.
- Neo4j는 재생성 가능한 read model이므로 graph traversal과 authoritative write를
  분리합니다.
- Kafka는 비동기 event를 전달하고, 동기 query, session, 가벼운 command는 Go
  HTTP/WebSocket/SSE 경계를 사용합니다.

AWS에서 검증한 slice는
`HTTP -> Go -> Kafka -> NestJS worker x 2 -> PostgreSQL`입니다. Smoke event가
Kafka topic, partition, offset과 함께 저장되고 consumer lag가 0으로 돌아온 것을
확인했습니다. 처리는 exactly-once를 주장하지 않고 at-least-once delivery,
`eventId` idempotency, PostgreSQL 저장 후 manual offset commit을 사용합니다.

Graph profile과 worker 2개를 사용하면 고유 image 8개로 container 11개를
생성하며, 초기화 container 2개가 성공 후 종료되어 9개 service가 상시
실행됩니다.

| 분산 영역 | 현재 상태 |
| --- | --- |
| Go HTTP ingestion 및 Kafka producer | 구현 및 검증 완료 |
| NestJS consumer group 및 PostgreSQL 저장 | 구현 및 검증 완료 |
| Worker 2개 partition 분산 | 구현 및 검증 완료 |
| Mosquitto broker | 내부 배포 완료 |
| Go MQTT subscriber | Skeleton only |
| Neo4j service | 배포 및 정상 기동 확인 |
| Rust Kafka consumer 및 Neo4j projection | Skeleton only |
| Go graph query 및 Next.js graph drill-down | Skeleton/계획 단계 |

검증된 slice가 MQTT ingestion이나 Neo4j projection까지 완료됐다는 뜻은 아닙니다.
상세 경계는 [2차 분산 확장 계획](./docs/implementation-2nd-plan.md)과
[scaffolding handoff](./docs/implementation-2nd-001-scaffolding-handoff.md)를
참고하세요.

## 하나의 이야기로 시스템 이해하기

각 기술을 별도의 공부거리로 외우기보다 하나의 시스템에서 맡은 역할로 묶으면
전체 구조를 훨씬 쉽게 이해할 수 있습니다.

| 기술 | 존재하는 이유 |
| --- | --- |
| **Next.js / React** | 사람이 상태를 보고 command를 내릴 화면을 제공합니다. |
| **TypeScript** | UI와 AI application logic을 type-safe하게 구현합니다. |
| **Go Gateway** | 외부 입력을 받아 내부 service 경계로 전달합니다. |
| **HTTP/REST** | 프로그램 사이의 동기 request-response 경계를 제공합니다. |
| **MQTT / Mosquitto** | 작은 device가 telemetry를 publish할 가벼운 pub/sub channel을 제공합니다. |
| **Kafka** | Event를 완충하고 partition 기반 작업을 독립 consumer에 분배합니다. |
| **NestJS worker** | Kafka를 poll해 validation과 operational processing을 수행합니다. |
| **PostgreSQL** | 잃어버리면 안 되는 분산 operational record를 영속화합니다. |
| **Neo4j** | 복잡한 관계를 graph read model로 projection하고 탐색합니다. |
| **Ontology / Semantic Layer** | 시스템과 AI가 공유하는 vocabulary와 의미를 정의합니다. |
| **Gemini / LLM** | 언어를 이해해 tool 선택, 설명, 제안을 생성합니다. |
| **Mastra** | 여러 AI review 단계를 명시적인 workflow로 구성합니다. |
| **Zod / JSON Schema** | 외부 입력과 언어 간 contract를 runtime에서 검증합니다. |
| **Docker / Compose** | 각 실행환경을 고정하고 service를 하나의 시스템으로 기동합니다. |
| **AWS EC2** | 개발자 PC 밖에서 전체 시스템을 계속 실행합니다. |

머릿속에서는 다음처럼 압축할 수 있습니다.

```text
React는 보여준다
API는 받고 응답한다
MQTT는 기계에서 받는다
Kafka는 완충하고 나눠준다
worker는 처리한다
PostgreSQL은 운영 사실을 기억한다
Neo4j는 관계를 탐색한다
ontology는 의미를 정의한다
LLM은 그 의미로 사람과 소통한다
Docker는 각 부품을 포장한다
```

### 서로 다른 두 가지 흐름

모든 요청이 Kafka를 통과하는 것은 아닙니다. 동기 query는 지금 답을 요구합니다.

```text
Browser -> API -> data store -> API -> Browser
```

Kafka는 producer가 downstream 처리를 기다리지 않아야 하는 비동기 event path에
사용합니다.

```text
Device -> MQTT -> Go -> Kafka -> worker -> PostgreSQL
```

첫 번째 경로는 "현재 답을 돌려달라"는 의미이고, 두 번째 경로는 "무슨 일이
발생했으니 안정적으로 처리하라"는 의미입니다. Kafka를 범용 RPC처럼 사용하면
단순 query까지 느리고 복잡해지며 두 책임이 섞입니다.

현재 query 경계는 `Browser -> Next.js thin BFF -> Go -> PostgreSQL/Neo4j`이며,
Next.js에는 standalone database fallback이 남아 있지 않습니다.

### Telemetry 한 건 따라가기

공장 온도 sensor가 `37.8 C`를 보고한다고 가정해 보겠습니다.

1. **Device ingress.** 목표 경로에서 device는
   `devices/TEMP-001/telemetry` 같은 topic으로 versioned telemetry envelope를
   publish합니다. Mosquitto가 MQTT broker를 제공합니다. Broker는 배포됐지만 Go
   MQTT subscriber는 아직 skeleton이므로 AWS 검증은 현재 Go HTTP endpoint에서
   시작합니다.
2. **Gateway validation.** Go는 telemetry envelope를 검사하고 수락한 event를
   `telemetry.raw`에 publish합니다. Worker 처리가 끝날 때까지 기다리거나 raw
   event를 PostgreSQL에 직접 저장하지 않습니다.
3. **Durable distribution.** Kafka는 record를 6개 partition 중 하나에
   보관합니다. Device ID를 record key로 사용하므로 같은 device의 event는 같은
   partition에 일관되게 배치되어 순서 있게 처리할 수 있습니다.
4. **Consumer-group processing.** 각 NestJS worker는
   `physicalai-telemetry-workers` member로 Kafka를 지속적으로 poll합니다. Kafka가
   active worker에 partition을 나눠 줍니다. Go는 consumer가 둘인지 셋인지 그
   이상인지 알 필요가 없습니다.
5. **Operational persistence.** Worker는 event를 검증한 뒤 Kafka topic,
   partition, offset과 함께 PostgreSQL에 저장합니다. Unique `eventId`가
   redelivery를 안전하게 만듭니다. Deterministic rule 이식과 conditional Mastra
   실행은 후속 worker 단계이며 현재 slice의 완료 항목이 아닙니다.
6. **Read-side use.** 향후 동기 API는 authoritative operational state를 직접
   조회할 수 있습니다. Semantic relation event는 별도로 Rust projector와
   Neo4j에 전달할 수 있으므로 Neo4j가 대량 telemetry write path에 들어가지
   않습니다.

Kafka와 PostgreSQL은 서로 다른 질문에 답합니다.

```text
Kafka:      무슨 일이 발생했고 무엇이 아직 처리되어야 하는가?
PostgreSQL: 어떤 operational fact가 수락되어 영속화됐는가?
```

### AI는 어디에 있는가

AI는 deterministic system을 대신하지 않고 그 옆에 있습니다. 사용자가 "왜
Buzzer가 작동했어?"라고 물으면 application이 먼저 기록된 sensor, rule,
command evidence를 재구성합니다. Ontology는 entity와 relation의 의미를 AI에
알려주고, tool은 필요한 API만 노출하며, Mastra는 review 단계를 구성하고, LLM은
evidence를 사람이 이해할 설명으로 바꿉니다.

```text
사용자 질문
  -> ontology 기반 tool 선택
  -> event / rule / state evidence
  -> deterministic causal trace
  -> 선택적 Mastra/LLM review
  -> 설명
```

LLM은 승인된 rule을 실행하거나 event persistence를 대신하지 않으며 provenance가
없을 때 원인을 지어내지 않습니다. Auditable application logic 위에 자연어 이해,
제안, 설명 능력을 추가합니다.

전체 시스템은 한 문장으로 압축할 수 있습니다.

> 사람이나 기계의 입력을 API 또는 MQTT가 받고, Kafka가 대량 event를 완충하고
> 분배하며, worker가 operational logic으로 처리하고, PostgreSQL이 authoritative
> 결과를 기억하며, semantic layer가 데이터의 의미를 정의하고, AI가 그 의미와
> 통제된 tool을 이용해 시스템과 사람을 연결합니다.

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
Go Gateway → PostgreSQL / Neo4j
```

Gemini는 database에 직접 접근하지 않습니다. 모든 질문은 `getOntology()`로 시작합니다. 사용 가능한 class, property, relationship을 이해한 뒤에야 Gemini는 필요한 REST resource만 요청합니다.

Physical AI 확장은 같은 경계를 유지하면서 API 아래에 deterministic runtime을 추가합니다.

```text
Simulator Sensor → Sensor Event → Rule Engine → Virtual Device
                                      ↓
                               Auditable Event Log
```

승인된 rule을 평가하고 device command를 실행하는 것은 Gemini가 아니라 rule engine입니다. Simulator는 향후 MQTT/Arduino 연결을 위해 남겨둔 adapter boundary와 같은 경계를 구현합니다.

Workspace Dashboard에는 설명 가능한 action event를 위한 최소 **Explain Why** 흐름도 포함됩니다. Event Timeline에 device command가 나타나면 사용자는 Ask AI Explain Mode로 이동할 수 있습니다. Backend는 먼저 기록된 event에서 application-level causal trace를 deterministic하게 재구성한 뒤, 작은 Mastra workflow로 sensor, rule, execution evidence를 검토하고 structured explanation을 생성합니다. 이 기능은 read-only입니다. Device command를 실행하거나 rule을 바꾸지 않으며, 물리 세계가 왜 특정 sensor reading을 만들었는지는 추론하지 않습니다.

LLM 연동은 provider boundary 뒤에 준비하고 있습니다. `lib/ai/llm/provider.ts`는 model-agnostic interface를 정의하고, `lib/ai/llm/gemini-provider.ts`는 기존 Vertex Gemini client를 그 interface에 맞게 감쌉니다. 이 구조 덕분에 현재 Gemini 3.5 Flash Lite 설정을 유지하면서도 이후 다른 provider로 교체할 때 Mastra workflow code 변경을 줄일 수 있습니다.

PostgreSQL schema는 semantic metadata와 operational state를 분리합니다. Ontology record는 `semantic_*` table에, runtime state는 sensor, device, telemetry, command, event, rule table에 저장됩니다.

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

1. `domain/physical.ts`에서 시작합니다.<br>
   sensor란 무엇인지, device란 무엇인지, reading과 command의 최소 공유 계약이 무엇인지 정의합니다.
2. 그다음 `domain/rule.ts`를 정의합니다.<br>
   어떤 reading을 condition으로 평가할 수 있는지, 어떤 device action을 실행할 수 있는지 결정합니다.
3. 그다음 `domain/ontology.ts`를 정의합니다.<br>
   class, property, individual, relation으로 시스템을 semantic layer에서 설명합니다.
4. 마지막으로 `db/schema.ts`를 설계합니다.<br>
   domain concept를 persistent table로 매핑합니다.

이 방식은 implementation plan을 시스템의 vocabulary와 behavior에 먼저 맞춘 다음, 그 모델을 storage, runtime orchestration, API, AI tool로 확장하게 해줍니다.

같은 계획은 몇 가지 재사용 가능한 architecture pattern도 보존합니다.

- Physical I/O, database access, LLM provider call은 교체 가능한 adapter 또는 provider boundary 뒤에 둡니다.
- 외부 입력은 runtime boundary에서 검증하고, 가능하면 같은 schema에서 TypeScript type을 추론합니다.
- 빠른 UI rendering을 위해 current state snapshot을 제공하고, 설명과 debugging을 위해 auditable event history를 남깁니다.
- 실시간 운영 update는 WebSocket 없이 cursor 기반 SSE와 heartbeat로 stream합니다.
- 현재 event stream은 demo deployment 단순성을 위해 server-side DB polling 후 SSE로 전달합니다. Simulator에서 reading이 발생할 때마다 runtime이 callback으로 저장하지만, SSE client에 즉시 publish하는 in-memory event bus는 아직 두지 않았습니다. 이 선택은 sub-second realtime보다 reconnect/replay가 쉬운 auditable demo 흐름을 우선한 compromise입니다.
- Rule evaluation은 pure하게 유지하고, runtime orchestration이 persistence, event, device command를 담당합니다.
- Ontology-first AI tool calling은 prompt만이 아니라 code로 강제하고, AI tool은 database/hardware 직접 접근 대신 REST API를 통하게 합니다.
- AI는 automation을 propose할 수 있지만, approval과 mutation은 별도의 human-controlled action으로 유지합니다.

`domain/` model을 만들기 전에 필요한 ontology 용어 결정은 [`docs/ontology-modeling-notes.md`](./docs/ontology-modeling-notes.md)에 정리해 두었습니다.

완성된 domain model을 기반으로 구체적 개발을 이어가는 retrospective implementation handoff plan은 [`docs/implementation-1st-plan.md`](./docs/implementation-1st-plan.md)를 참고하세요. 별도의 분산 Physical AI 확장 계획은 [`docs/implementation-2nd-plan.md`](./docs/implementation-2nd-plan.md)에 있습니다.

## 기능

- 세 열 ontology explorer와 detail view, live JSON
- React Flow 기반 relationship graph
- Sensor, device, reading, rule, event를 위한 physical workspace table과 분리된 namespaced semantic metadata table
- Zod validation이 적용된 read/create REST endpoint
- Ontology-first flow가 강제된 Gemini tool-calling agent
- 방문자별 UTC day 기준 10회 Ask AI 임시 보호
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
| `GET` | `/api/health` | 가벼운 process health check |
| `GET` | `/api/ready` | Database 및 runtime readiness check |
| `GET` | `/api/state` | 현재 simulated workspace snapshot |
| `GET` | `/api/sensors` | 최신 reading이 포함된 sensor 목록 |
| `GET` | `/api/devices` | Virtual device state 목록 |
| `POST` | `/api/devices/:id/commands` | 검증된 virtual-device command 실행 |
| `GET` | `/api/events` | Physical workspace event timeline 조회 |
| `GET` | `/api/events/stream` | Physical workspace event timeline 스트리밍 |
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
EXPLAIN_LLM_REVIEW=disabled
GO_GATEWAY_URL=http://localhost:8080
```

Google Cloud project는 service account JSON의 `project_id`에서 읽습니다. `GOOGLE_CLOUD_PROJECT`는 optional override로 남아 있습니다. Gemini model의 configuration source는 `GEMINI_MODEL` 하나이며, 기본값은 `gemini-3.5-flash-lite`입니다.

PostgreSQL이 ontology, rule, sensor, device state, command, event, Explain evidence의 authoritative store입니다. `EXPLAIN_LLM_REVIEW=enabled`를 설정하면 Mastra evidence review step들이 앱 전체 LLM adapter를 통해 live LLM review를 수행합니다.

## AWS 배포 형태

현재 `.fordeploy/deploy.sh`는 검증된 clean clone에서 `linux/amd64` application
image 4개를 로컬 build하고 infrastructure image 4개를 로컬에서 pull한 뒤, 고유
image 8개를 Bastion host 경유로 전송합니다. Private EC2는 언어 SDK를 설치하거나
service를 build하지 않고 `docker load`와 Compose startup을 수행합니다. 배포는
항상 maintainer가 수동으로 실행합니다.

이 repository가 이전에 사용했던 source-archive 배포 형태는 아래와 같습니다.
현재 active path가 아니라 역사적 설계 맥락으로 보존합니다.

```text
local machine
  -> create ai-workspace-source.xxxxxx.tar.gz
  -> scp source archive to Bastion EC2
  -> Bastion scp source archive to private EC2
  -> private EC2 extracts the source into a temporary build directory
  -> private EC2 runs docker build
  -> private EC2 replaces the ai-physical-workspace container
```

비활성 legacy deployment block은 reference로 남아 있지만 active path는 로컬
build image archive를 사용합니다.

## 프로젝트 철학

이 프로젝트는 Protégé clone이 아닙니다. OWL, RDF, SPARQL, reasoning, ontology
import/export, permission은 의도적으로 구현하지 않습니다. Neo4j는 범용 ontology
editor나 source of truth가 아니라 재생성 가능한 semantic read model로만
추가하고 있습니다. 교육 목적은 **Semantic Layer → API → Gemini → UI**와 분산
telemetry 흐름을 visible하고 inspectable하게 만드는 것입니다.

## 향후 작업

OWL import, RDF export, reasoner, 완성된 Neo4j projection/query workflow,
Palantir-style ontology modeling, MCP server, enterprise semantic layer,
natural-language workflow, role-based action은 숨겨진 scope가 아니라 명시적인
future direction으로 남겨둡니다.

## 스택

Next.js 16 standalone · TypeScript · Tailwind CSS · shadcn-style UI primitives · React Flow · Zod · Mastra · Google Gemini · Go · Apache Kafka · NestJS · PostgreSQL · MQTT · Rust · Neo4j · Docker Compose
