# BestAiCom Semantic Workspace

[English README](./README.md) | [실행 중인 데모](https://physicalai.penvot.com)

동작하는 단일 애플리케이션 데모에서 출발해 **대량 telemetry를 처리할 수 있는
분산 시스템으로 확장 가능하도록 설계한 ontology-first Physical AI
workspace**입니다.

설명 가능한 Next.js 제품에 Go ingress, partition 기반 Kafka stream, 수평
확장 가능한 NestJS worker, PostgreSQL, MQTT, Rust, Neo4j를 결합했습니다. 중요한
점은 기술의 개수가 아니라 ingress, 처리, 운영 저장소, semantic projection을
서로 독립적으로 확장하면서 기존 사용자 경험을 유지할 수 있다는 것입니다.

## 핵심 가치

LLM은 database field, device reading, 업무 관계의 의미를 본질적으로 알지
못합니다. 이 프로젝트는 AI, API, 운영 데이터 사이에 semantic contract를 두고,
그 계약을 유지한 채 고처리량 분산 구조로 진화하는 과정을 보여줍니다.

- LLM이 database나 device에 직접 접근하지 않는 ontology-first AI tool
- AI-assisted automation을 통제하는 deterministic rule과 human approval
- Device action에 대한 auditable Explain Why causal trace
- Telemetry 증가에 대응하는 Kafka partition과 worker scale-out
- At-least-once delivery와 idempotent PostgreSQL persistence
- Authoritative operational data와 분리된 재생성 가능 Neo4j projection

## 아키텍처

기존 사용자-facing baseline은 저장소 루트에 그대로 유지합니다.

```text
Browser
  -> Next.js UI와 API route
  -> ontology, simulator, rule, event, Explain Why
  -> SQLite + Drizzle
  -> application-owned provider boundary를 통한 Gemini
```

그 옆에 분산 telemetry 처리 경로를 추가했습니다.

```text
HTTP telemetry
  -> Go Gateway
  -> Kafka telemetry.raw (6 partitions)
  -> NestJS worker x N (하나의 consumer group)
  -> PostgreSQL
```

목표 production 경로는 같은 경계를 다음처럼 확장합니다.

```text
MQTT devices
  -> Go Gateway
  -> Kafka
  -> NestJS/Mastra worker x N
  -> PostgreSQL authoritative store

semantic.graph.rebuild / semantic.relation.changed
  -> Rust graph worker
  -> Neo4j semantic read model
```

### 대량 처리를 확장하는 방법

- **Ingress:** Go Gateway instance를 늘려 같은 Kafka cluster에 publish합니다.
- **Transport:** Kafka partition이 device key를 분산하면서 같은 device의 순서를
  보존합니다.
- **Processing:** 동일한 worker image를 수평 확장하면 Kafka가 consumer group의
  instance들에 partition을 분배합니다.
- **Storage:** PostgreSQL은 application container와 독립적으로 확장 가능한
  operational source of truth입니다.
- **Semantic read:** Neo4j는 비동기 재생성 가능한 projection이므로 graph traversal
  부하가 authoritative store의 역할을 바꾸지 않습니다.
- **Capacity:** service replica, Kafka partition, infrastructure profile을 단계적으로
  늘릴 수 있으며 단일 runtime/database 구조로 되돌아가지 않습니다.

Kafka는 비동기 event transport이며 RPC bus가 아닙니다. 동기 query, session,
가벼운 command는 Go HTTP/WebSocket/SSE 경계를 사용합니다.

## 현재 구현 상태

| 영역 | 상태 |
| --- | --- |
| Next.js ontology 및 Physical Workspace UI | 구현 완료 |
| SQLite simulator, deterministic rule, event, audit history | 구현 완료 |
| Gemini tool, Rule Compiler, chat, Explain Why | 구현 완료 |
| Versioned JSON Schema contract | scaffold 완료, telemetry contract 사용 중 |
| Go HTTP ingestion 및 Kafka producer | 구현 및 검증 완료 |
| NestJS consumer group 및 PostgreSQL 저장 | 구현 및 검증 완료 |
| Worker 2개 partition 분산 | 구현 및 검증 완료 |
| Mosquitto broker | 내부 network에 배포됨 |
| Go MQTT subscriber | skeleton only |
| Neo4j service | 배포 및 정상 기동 확인 |
| Rust Kafka consumer 및 Neo4j projection | skeleton only |
| Go graph query와 Next.js graph drill-down | skeleton/계획 단계 |
| Application-controlled SSH terminal | skeleton, OS shell 미노출 |

AWS에서 실제 검증한 vertical slice는 다음과 같습니다.

```text
POST /telemetry
  -> Go가 event를 수락하고 publish
  -> Kafka telemetry.raw partition에 저장
  -> NestJS worker 2개 중 하나가 consume
  -> PostgreSQL에 eventId, topic, partition, offset 저장
  -> consumer-group lag 0 확인
```

검증 범위는 `HTTP -> Go -> Kafka -> worker -> PostgreSQL`입니다. MQTT ingestion과
Neo4j projection까지 완료됐다고 주장하지 않습니다.

## Runtime Service

Graph profile과 `worker=2`는 고유 image 8개로 container 11개를 생성합니다.
Migration과 topic 생성 container 2개는 성공 후 종료되어 9개 service가 상시
실행됩니다.

| Service | Runtime | 책임 |
| --- | --- | --- |
| `frontend` | Next.js / TypeScript | UI, BFF route, semantic workspace |
| `api` | Go | Ingress, Kafka publish, 향후 session 및 graph query |
| `worker` x2 | NestJS / TypeScript | Kafka poll, validation, idempotency, persistence |
| `postgres` | PostgreSQL | 분산 operational data의 authoritative store |
| `kafka` | Apache Kafka | Partition 기반 event transport와 consumer group |
| `mosquitto` | MQTT | 내부 device messaging broker |
| `neo4j` | Neo4j | 재생성 가능한 semantic read model |
| `graph-worker` | Rust | Kafka-to-Neo4j projector skeleton |

`migrate`와 `kafka-init`은 infrastructure image를 재사용하고 초기화 후
종료됩니다. Worker에는 HTTP server가 없습니다. KafkaJS가 Kafka를 poll하고,
Kafka가 같은 consumer group의 instance에 partition을 배분합니다.

## Delivery Semantics

Telemetry 처리는 exactly-once라고 주장하지 않습니다.

```text
Kafka at-least-once delivery
+ eventId unique constraint
+ INSERT ... ON CONFLICT DO NOTHING
+ PostgreSQL commit 후 manual Kafka offset commit
```

Database commit 후 offset commit 전에 worker가 종료되면 Kafka가 record를 다시
전달할 수 있습니다. 안정적인 `eventId`가 재처리를 idempotent하게 만듭니다.

## 주요 기능

- Ontology explorer와 React Flow relationship graph
- Temperature, light, distance, button seeded simulator
- Adapter boundary 뒤의 virtual LED, servo, buzzer, relay
- Validation, cooldown, deterministic evaluation을 포함한 rule CRUD
- Sensor-to-rule-to-device event timeline과 audit trail
- Deterministic evidence와 Mastra review를 사용하는 read-only Explain Why
- Validated preview와 명시적 승인을 포함한 Gemini Rule Compiler
- Ontology에 grounded된 Physical Workspace chat
- Cursor 기반 SSE와 bounded retention cleanup

## 저장소 구조

```text
app/             Next.js UI와 API route
domain/          ontology, physical-device, rule vocabulary
lib/             runtime, store, AI provider, Mastra workflow
db/              SQLite/Drizzle schema와 migration
contracts/       언어 중립 JSON Schema contract
api/             Go Gateway
worker/          NestJS Kafka worker
graph-worker/    Rust projector skeleton
infra/           PostgreSQL, Kafka, MQTT, Neo4j 설정
compose.yaml     로컬 분산 stack
.fordeploy/      maintainer 수동 AWS 배포 asset
docs/            plan, state inventory, implementation handoff
```

## 로컬 실행

기존 UI는 Node.js 22.13+ 환경에서 독립 실행할 수 있습니다.

```bash
npm install
npm run dev
```

분산 stack은 `.env.example`에 문서화된 값을 ignored local environment file에
준비한 뒤 Docker Compose로 실행합니다.

```bash
docker compose --profile graph up -d --build --scale worker=2
```

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe --group physicalai-telemetry-workers
```

## AWS 배포

Maintainer가 배포 스크립트를 직접 실행합니다. 스크립트는 clean checkout을
검증하고 전용 clean clone에서 `linux/amd64` application image 4개를 빌드한 뒤,
infrastructure image 4개와 함께 bastion 경유로 전송합니다. Private EC2는
`docker load`와 Compose만 실행하며 host에 언어 SDK나 database server를 직접
설치하지 않습니다.

```bash
./.fordeploy/deploy.sh
```

배포는 항상 수동입니다. Credential은 ignored host file에만 두며 image나 배포
archive에 포함하지 않습니다.

## 주요 설계 결정

- 기존 Next.js root 구조를 유지하며 `frontend/`로 옮기지 않습니다.
- Domain contract는 versioned JSON Schema이고 Kafka payload는 UTF-8 JSON입니다.
- Telemetry 전달을 위해 Go와 NestJS가 HTTP나 gRPC로 직접 호출하지 않습니다.
- 모든 telemetry에 Mastra 또는 LLM을 호출하지 않습니다.
- PostgreSQL은 authoritative store, Neo4j는 rebuildable projection입니다.
- SSH는 OS shell이 아닌 application-controlled session만 제공합니다.
- Spring Boot는 이번 확장 단계의 범위가 아닙니다.

## 문서

- [분산 scaffold 이전 상태](./docs/current-state.md)
- [1차 구현 handoff](./docs/implementation-1st-plan.md)
- [2차 분산 확장 계획](./docs/implementation-2nd-plan.md)
- [Scaffolding 및 vertical slice](./docs/implementation-2nd-001-scaffolding-handoff.md)
- [AWS 배포 준비](./docs/implementation-2nd-002-aws-demo-deployment-preparation.md)
- [Ontology modeling notes](./docs/ontology-modeling-notes.md)

## Stack

Next.js 16 · TypeScript · Tailwind CSS · SQLite · Drizzle ORM · React Flow · Zod ·
Mastra · Google Gemini · Go · Apache Kafka · NestJS · PostgreSQL · MQTT · Rust ·
Neo4j · Docker Compose
