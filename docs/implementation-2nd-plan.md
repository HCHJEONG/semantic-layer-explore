# Implementation 2nd Plan: Distributed Physical AI Expansion

## 0. 문서 성격

이 문서는 1차 Semantic Workspace baseline 이후에 착수한 **분산 Physical AI 처리 시스템 확장 계획**이다. 현재 구현 상태를 설명하는 handoff 문서는 `docs/implementation-1st-plan.md`이며, 이 문서는 그 기준선을 보존한 뒤 Go, MQTT, Kafka, PostgreSQL, NestJS worker, Rust graph worker, Neo4j를 추가하는 2차 확장 범위를 정의한다.

따라서 이 문서의 "확정 아키텍처"와 완료 기준은 2차 확장 범위 안에서의 목표 상태를 뜻한다. 구현 완료 여부는 numbered handoff 문서, 특히 `docs/implementation-2nd-015-mqtt-outbound-failure-ux-handoff.md`를 기준으로 판단한다. 2차 계획의 `aws-demo` 배포는 maintainer의 수동 배포로 완료되었으며, 에이전트가 직접 배포 명령을 실행한 것은 아니다.

### 0.1 확정된 Polyglot Monorepo 범위

이 2차 계획은 의도적으로 거대한 polyglot distributed monorepo를 만든다. Go, NestJS/TypeScript, Rust, Kafka, PostgreSQL, MQTT, Neo4j는 제거하거나 단일 runtime으로 접기 위한 후보가 아니라 이 단계의 핵심 학습·검증 대상이다.

구현 중 난점이 생겨도 기본 대응은 architecture 축소가 아니다. sequencing, profile 분리, instance size 조정, resource limit, contract test, observability, rollout gate로 복잡도를 통제한다. 단일 Next.js application, 단일 database, 단일 language runtime으로 되돌아가는 방향은 이 2차 계획의 목표와 맞지 않는다.

### 0.2 범위 통제 원칙

범위는 줄이지 않고 순서를 통제한다. 핵심 telemetry path와 failure semantics를 먼저 증명하고, Mastra migration, SSH/Scene IR, Rust/Neo4j projection은 각자의 검증 gate를 통과하며 붙인다.

초기 instance는 `aws-demo`의 `t3a.medium`을 기준으로 잡지만, 이는 비용 효율적인 출발점이다. 실제 측정에서 CPU, memory, I/O, swap, PSI 한계가 드러나면 `t3a.large` 이상으로 올리는 것은 정상적인 capacity adjustment이며 프로젝트 범위 축소 사유가 아니다.

작업의 최종 목표는 다음 구조를 실제로 구현하고 검증하는 것이다.

```text
Next.js
  + Go API/Protocol Gateway × 1 (HTTP·WebSocket·SSH·MQTT)
  + MQTT Broker
  + Kafka
  + NestJS/Mastra Worker × 2 이상
  + PostgreSQL
  + Rust Graph Projection Worker × 1
  + Neo4j semantic read model
```

배포 대상은 운영 서버 `aws-prod`가 아니라 실험 서버 `aws-demo`다. `aws-prod`는 현재 운영 서비스를 위해 `t3a.medium`으로 유지하고, `aws-demo`를 `t3a.small`에서 `t3a.medium`으로 변경한 뒤 이 프로젝트를 배포한다. 애플리케이션 이미지는 EC2에서 빌드하지 않는다. 로컬 WSL에서 `linux/amd64` image를 빌드하고 tar 압축본으로 전송한다.

Spring Boot는 이 버전의 구성에 추가하지 않는다. 동기 API와 장기 연결 protocol은 Go가 담당하고, 기존 TypeScript/Mastra 코드는 NestJS worker에서 재사용한다. 향후 World·Policy·Ledger처럼 복잡한 transactional domain core가 실제로 필요해질 때 Spring 도입을 별도 ADR로 검토한다.

중간에 `Next.js + Go + PostgreSQL`만 동작하는 별도 완성 단계를 만들지 않는다. 대량 telemetry의 정상 처리 경로는 처음부터 끝까지 반드시 다음을 통과해야 한다.

```text
MQTT → Go API → Kafka → NestJS/Mastra Worker × N → PostgreSQL
```

구현은 작은 milestone으로 나누되 모든 milestone은 위 최종 아키텍처를 향해야 한다.

---

## 1. 프로젝트 목적

이 프로젝트는 단순히 Kafka, Go, NestJS라는 기술 이름을 추가하는 작업이 아니다. 다음 능력을 실행 가능한 코드와 측정 결과로 증명해야 한다.

- MQTT 기반 장치 통신
- Go 기반 경량 ingestion/API gateway
- Kafka topic·partition·consumer group
- 동일 NestJS worker image의 수평 확장
- 기존 TypeScript Mastra agent·tool·workflow 재사용
- Rust 기반 Kafka graph projection worker
- Neo4j 기반 ontology/semantic relation 조회
- 결정론적 처리와 AI Agent 처리의 경계
- at-least-once 환경의 idempotency
- 장치별 ordering
- worker 장애와 consumer rebalance
- PostgreSQL을 활용한 DynamoDB식 access-pattern-first 연습
- 장애·부하·복구 실험
- Docker Compose 기반 재현 가능한 monorepo

최종 결과물은 다음 질문에 실제 수치와 실험으로 답할 수 있어야 한다.

1. Worker 1개, 2개, 4개에서 처리량이 어떻게 달라지는가?
2. Worker 하나를 종료하면 partition이 어떻게 재할당되는가?
3. DB commit 이후 offset commit 전에 worker가 죽으면 중복 저장을 어떻게 막는가?
4. 같은 장치의 이벤트 순서는 어디까지 보장되는가?
5. Mastra/LLM 호출이 느리거나 실패해도 다른 작업이 계속 처리되는가?
6. 병목은 API, Kafka, worker, PostgreSQL 중 어디에서 발생하는가?
7. PostgreSQL의 관계 변경이 transactional outbox를 거쳐 Neo4j에 언제, 어떻게 투영되는가?
8. Neo4j projection이 유실되거나 삭제되어도 원본에서 재구축할 수 있는가?
9. 동일한 World action을 Next.js와 SSH에서 실행했을 때 같은 application rule과 결과를 사용하는가?
10. 동기 조회와 비동기 분산 작업의 경계가 명확하며 Kafka를 불필요한 RPC bus로 사용하지 않는가?

---

## 2. Codex 수행 원칙

1. 수정 전 저장소 지침과 현재 구조를 조사한다.
2. `AGENTS.md`, `CLAUDE.md`, `.codex` 등 저장소 지침이 있으면 먼저 준수한다.
3. 기존 UI, semantic map, automation, Ops Copilot, MQTT simulation 동작을 baseline으로 확보한다.
4. 기존 TypeScript Mastra 코드를 삭제하거나 전면 재작성하지 않는다. Next.js runtime 종속성을 제거해 worker에서 재사용한다.
5. 기존 MQTT adapter를 먼저 분석하고 Go gateway로 이동·재사용할 수 있는 범위를 확인한다.
6. 관련 없는 파일 이동, 포맷 변경, dependency upgrade를 하지 않는다.
7. Next.js를 `frontend/`로 이동하지 않는다. 기존 root 구조를 보존한다.
8. Go API가 telemetry를 PostgreSQL에 우회 저장하지 못하게 한다.
9. Worker는 최소 두 개의 독립 container로 실행한다.
10. Worker별 코드를 복제하지 않는다. 하나의 image를 Compose scale로 실행한다.
11. `container_name`을 worker에 지정하지 않는다.
12. exactly-once를 주장하지 않는다. at-least-once와 idempotency를 구현한다.
13. 모든 telemetry에 LLM을 호출하지 않는다.
14. Neo4j에 raw telemetry 전체를 저장하지 않는다.
15. Rust worker를 NestJS telemetry worker와 같은 consumer group에 섞지 않는다.
16. 테스트하지 않은 사항을 완료했다고 보고하지 않는다.
17. 실제 저장소와 이 문서의 가정이 다르면 실제 코드를 우선하되, 아키텍처 핵심을 바꿔야 할 경우 먼저 보고한다.
18. Spring Boot를 단순한 Next.js용 중간 backend로 추가하지 않는다.
19. SSH listener를 수평 확장되는 NestJS worker에 넣지 않는다.
20. 실제 OS shell을 외부에 노출하지 않는다. SSH는 application-controlled terminal session만 제공한다.

---

## 3. 먼저 조사할 현재 상태

코드를 수정하기 전에 `docs/current-state-before-2nd-plan.md`를 작성한다.

### 3.1 Next.js

- Next.js와 Node.js 버전
- App Router 여부
- SQLite library/ORM
- API route와 server action
- SSE, WebSocket, polling 사용 여부
- UI가 데이터를 조회·변경하는 경로
- Dockerfile과 배포 방식

### 3.2 SQLite

- DB 파일 위치
- schema와 seed data
- 보존할 데이터인지 재생성 가능한 데모 데이터인지
- transaction과 unique constraint
- 현재 audit, telemetry, rule, device 저장 구조

### 3.3 MQTT

- adapter 위치와 언어
- 사용 library
- broker와 topic
- QoS
- retained message
- reconnect/resubscribe
- Last Will
- telemetry 및 command payload

### 3.4 Mastra

- agent 목록
- tool 목록
- workflow 목록
- model provider
- Zod schema와 structured output
- Next.js API/server action 종속성
- SQLite 직접 접근 여부
- MQTT 또는 외부 API 직접 접근 여부
- worker로 이동 가능한 순수 TypeScript 코드

### 3.5 배포

- 현재 EC2 instance와 메모리
- reverse proxy/ALB/TLS
- image build와 전송 방식
- volume과 backup
- health check
- 현재 container별 CPU/RSS
- `aws-demo`의 기존 container와 port 충돌
- 로컬 WSL Docker build 환경과 서버 CPU architecture
- image tar 압축·전송·rollback 방식

조사 완료 전 대규모 파일 이동이나 dependency 교체를 시작하지 않는다.

---

## 4. 확정 아키텍처

```text
Virtual Devices
      │
     MQTT
      ▼
  MQTT Broker
      │
      ▼
Go API/Gateway × 1
  ├── REST API for Next.js
  ├── WebSocket/SSE session delivery
  ├── SSH server and ANSI terminal sessions
  ├── MQTT inbound/outbound adapter
  ├── schema validation
  ├── Kafka producer
  ├── configuration command handling
  ├── PostgreSQL query adapter
  ├── Scene IR session routing
  └── ANSI renderer for SSH
      │
      ▼
Kafka
  ├── telemetry.raw
  ├── command.result
  ├── agent.result
  ├── audit.event
  └── dead-letter
      │
      │ Same consumer group
  ┌───┴────────────────┐
  ▼                    ▼
NestJS Worker 1    NestJS Worker 2 ... N
  ├── deterministic validation
  ├── idempotency
  ├── semantic context
  ├── automation rules
  ├── conditional Mastra workflow
  ├── persistence
  └── audit evidence
           │
           ▼
      PostgreSQL
       │       │
       │       └── outbox_event
       │                 │
       │                 ▼
       │            Outbox Relay
       │                 │
       │       semantic.graph.rebuild
       │       semantic.relation.changed
       │                 │
       │                 ▼
       │       Rust Graph Worker × 1
       │                 │
       │                 ▼
       │               Neo4j
       │
       ▼
  Go Query API ───────────────▶ Neo4j Query
       │
       ├── JSON/Scene IR ──▶ Next.js React renderer
       └── ANSI stream ────▶ SSH terminal
```

동기 경로와 비동기 경로를 구분한다.

```text
조회·인증·세션·가벼운 명령
Next.js/SSH → Go → PostgreSQL → 즉시 응답

AI·대량 telemetry·재시도 가능한 장기 작업
Next.js/SSH/MQTT → Go → Kafka → Worker × N → PostgreSQL
                                      └→ result event → Go session → client
```

Kafka는 모든 화면 요청을 통과시키는 message RPC가 아니다. 즉시 응답이 필요한 조회와 세션 처리는 Go가 직접 수행한다.

### 4.1 Go API 책임

- HTTP API와 ingress
- WebSocket/SSE session lifecycle
- SSH server, public-key authentication, PTY metadata, resize, keyboard/mouse escape sequence 처리
- application-controlled cinematic terminal과 ANSI byte streaming
- MQTT 연결과 장치 통신
- payload envelope 기본 검증
- 인증·인가·rate limit 경계
- Kafka 발행
- 장치/공장/규칙 설정 CRUD
- 처리 결과 조회
- actuator command 발행
- SSE 또는 WebSocket delivery
- `sessionId`·`correlationId` 기반 비동기 결과 routing
- Scene IR을 Next.js용 JSON과 SSH용 ANSI로 전달

Go API는 Mastra workflow를 실행하지 않는다.

SSH는 Go process의 별도 inbound adapter로 구현하되 HTTP와 동일한 application service/port interface를 호출한다. 네트워크 listener는 HTTP와 분리해 기본 `:2222`를 사용한다. `/bin/bash` 등 실제 OS shell을 spawn하지 않는다. host private key는 secret/file mount로 주입하고 source와 image에 포함하지 않는다. 초기 인증은 password보다 public key를 우선한다.

### 4.2 NestJS/Mastra Worker 책임

- Kafka consumer group 참여
- telemetry 및 command result 처리
- schema의 business validation
- 중복 검출
- sequence gap/out-of-order 검출
- semantic context 구성
- deterministic rule 평가
- 조건에 맞는 경우에만 Mastra 실행
- PostgreSQL transaction
- audit/evidence 생성
- retry와 DLQ
- 처리 metric과 consumer lag 노출

### 4.3 PostgreSQL 직접 접근 규칙

Go와 worker 모두 PostgreSQL adapter를 가질 수 있지만 쓰기 책임을 구분한다.

| 데이터 | 쓰기 주체 | 읽기 주체 |
|---|---|---|
| Factory·Device 설정 | Go API | Go API, Worker |
| Automation rule 설정 | Go API | Go API, Worker |
| Raw/processed telemetry | Worker | Go API |
| Command result | Worker | Go API |
| Agent result | Worker | Go API |
| Audit evidence | Worker | Go API |
| Migration metadata | Migration service | 해당 없음 |

Go API는 `telemetry.raw`를 Kafka에 발행한 후 같은 telemetry를 PostgreSQL에 직접 저장하지 않는다.

### 4.4 Neo4j의 지위

PostgreSQL은 authoritative operational store다. Neo4j는 ontology와 semantic relation을 조회하기 위한 **재생성 가능한 read model/projection**이다.

- PostgreSQL: Factory, Device, Rule, Responsibility, Audit 등 원본 상태
- Neo4j: `LOCATED_IN`, `ATTACHED_TO`, `RESPONSIBLE_FOR`, `DEPENDS_ON`, `APPLIES_TO` 등의 관계
- Neo4j 손실 시 PostgreSQL/ontology와 rebuild event로 재구축 가능해야 함
- PostgreSQL과 Neo4j에 application-level dual-write 금지
- graph projection은 eventual consistency를 명시적으로 허용
- raw·고빈도 telemetry는 PostgreSQL/Kafka에 유지
- 초기 사용자-facing graph UI는 `/operations`와 Explain/Impact drill-down에 한정한다.
- Next.js는 Neo4j에 직접 연결하지 않는다. Next.js API route는 thin BFF로 Go Gateway의 read-only graph query endpoint를 호출한다.

### 4.5 Next.js와 SSH의 지위

Next.js와 SSH는 같은 World Runtime을 사용하는 동등한 presentation adapter다.

| Client | Transport | 표현 |
|---|---|---|
| Next.js | REST + WebSocket/SSE | React, Canvas/SVG/3D, Scene IR, 운영 dashboard |
| SSH | SSH channel | ANSI, Unicode text-art, cinematic timing, keyboard/mouse |
| External agent | REST/WebSocket | 구조화 JSON action/result |

Scene IR에는 ANSI color code나 React component 이름을 넣지 않는다. `WARNING`, `SYSTEM`, `DIALOGUE` 같은 semantic style과 timeline을 기술하고 renderer가 client capability에 맞게 변환한다.

초기 UI 우선순위는 `/operations`가 높다. `/operations`는 Kafka lag, worker assignment, DLQ, processing latency, MQTT 상태, PostgreSQL/Neo4j projection lag처럼 분산 처리의 증거를 보여주는 관측 화면이다.

초기 Neo4j projection 활용도 `/operations`와 Explain/Impact drill-down에서 시작한다. 사용자는 device나 event를 선택해 factory, sensor, rule, responsible actor, dependency, downstream impact 같은 관계를 확인한다. 이때 Next.js API는 화면에 필요한 DTO만 얇게 구성하고, Neo4j driver와 Cypher query는 Go Gateway 내부에 둔다.

`/terminal`과 SSH는 처음부터 화려한 cinematic experience를 완성하려 하지 않는다. 초기 구현은 동일 action contract와 Scene IR을 Next.js와 SSH 양쪽에서 thin adapter로 재생한다는 사실을 증명하는 데 집중한다. 타이밍, text-art, keyboard/mouse interaction, 장면 연출의 품질은 telemetry path, idempotency, rebalance, operations observability가 검증된 뒤 확장한다.

Next.js 최소 화면은 다음 두 개다.

1. `/terminal`: SSH와 같은 장면을 Scene IR 기반 웹 cinematic terminal로 재생
2. `/operations`: Kafka lag, worker assignment, MQTT device, DLQ, processing latency, PostgreSQL/Neo4j projection 상태 표시

---

## 5. 확정 Monorepo 구조

```text
physicalai/
├── app/                          # 기존 Next.js 유지
├── components/
├── lib/
├── public/
├── package.json
├── package-lock.json             # 실제 package manager에 맞춤
├── next.config.*
├── tsconfig.json
├── Dockerfile                    # Next.js 전용
│
├── api/                          # Go API/Gateway
│   ├── cmd/api/
│   │   └── main.go
│   ├── internal/
│   │   ├── config/
│   │   ├── http/
│   │   ├── websocket/
│   │   ├── ssh/
│   │   ├── session/
│   │   ├── render/
│   │   ├── mqtt/
│   │   ├── kafka/
│   │   ├── command/
│   │   ├── query/
│   │   └── persistence/
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── worker/                       # NestJS + Mastra
│   ├── src/
│   │   ├── main.ts
│   │   ├── consumer/
│   │   ├── telemetry/
│   │   ├── automation/
│   │   ├── semantic/
│   │   ├── persistence/
│   │   ├── audit/
│   │   └── mastra/
│   │       ├── agents/
│   │       ├── tools/
│   │       └── workflows/
│   ├── test/
│   ├── package.json
│   ├── nest-cli.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── graph-worker/                 # Rust semantic graph projector
│   ├── src/
│   │   ├── main.rs
│   │   ├── consumer.rs
│   │   ├── projection.rs
│   │   └── neo4j.rs
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── Dockerfile
│
├── contracts/                    # 언어 중립 계약
│   ├── telemetry.schema.json
│   ├── command.schema.json
│   ├── command-result.schema.json
│   ├── agent-result.schema.json
│   ├── audit-event.schema.json
│   ├── semantic-relation.schema.json
│   ├── graph-rebuild.schema.json
│   ├── scene-ir.schema.json
│   ├── action-request.schema.json
│   └── session-result.schema.json
│
├── infra/
│   ├── postgres/
│   │   └── migrations/
│   ├── kafka/
│   │   └── config/
│   ├── mosquitto/
│   │   └── config/
│   └── neo4j/
│       └── config/
│
├── loadtest/
├── docs/
├── compose.yaml
├── .env.example
├── .dockerignore
├── docs/
│   └── implementation-2nd-plan.md
└── README.md
```

기존 `hooks/`, `styles/`, `types/`, `ontology/`, `scripts/` 등이 있으면 그대로 유지한다.

### 5.1 Build 경계

- root Dockerfile: Next.js만 build
- `api/Dockerfile`: Go API만 build
- `worker/Dockerfile`: NestJS/Mastra worker만 build
- `graph-worker/Dockerfile`: Rust graph projector만 build
- Kafka, PostgreSQL, MQTT를 application image에 포함하지 않음
- root `compose.yaml`이 조합
- root `.dockerignore`에서 `api/`, `worker/`, DB volume, build output 제외 검토
- 각 하위 build context에 맞는 `.dockerignore` 추가 가능
- 모든 application image는 `linux/amd64`를 target으로 로컬 WSL에서 build

Rust graph worker는 다음 library를 우선 검토한다.

- `tokio`: async runtime
- `rdkafka`: Kafka consumer
- `serde`, `serde_json`: contract parsing
- `neo4rs`: Neo4j Bolt client
- `tracing`: structured logging
- `thiserror`: error classification
- `uuid`, `chrono`: identifier와 timestamp

### 5.2 Database migration 소유권

PostgreSQL을 Go와 NestJS가 함께 사용하므로 migration을 어느 애플리케이션 시작 과정에도 숨기지 않는다.

- migration 파일은 `infra/postgres/migrations/`
- Compose에 일회성 `migrate` service
- 모든 migration은 version control
- Go API와 worker는 migration 완료 후 시작
- init SQL과 migration에 같은 schema를 중복 정의하지 않음

---

## 6. 계약과 메시지 Envelope

Go와 TypeScript가 source type을 공유할 수 없으므로 JSON Schema를 source of truth로 둔다.

```json
{
  "schemaVersion": 1,
  "eventId": "019...",
  "factoryId": "factory-001",
  "deviceId": "device-042",
  "sequenceNumber": 38192,
  "eventTime": "2026-08-22T10:21:34.235Z",
  "receivedAt": "2026-08-22T10:21:34.291Z",
  "type": "MOTOR_TEMPERATURE",
  "payload": {
    "value": 78.4,
    "unit": "CELSIUS"
  },
  "traceId": "..."
}
```

요구사항:

- `eventId` 전역 unique
- `schemaVersion` 필수
- UTC timestamp
- `eventTime`과 `receivedAt` 분리
- topic identity와 payload identity 일치
- 최대 payload 크기
- 알 수 없는 schema version 격리
- Go와 TypeScript contract test
- backward-compatible schema 변경 규칙 문서화

---

## 7. Kafka 설계

### 7.1 최소 topic

```text
telemetry.raw
action.requested
scene.generated
command.result
agent.result
audit.event
dead-letter
semantic.graph.rebuild
semantic.relation.changed
semantic.graph.dead-letter
```

초기 핵심은 `telemetry.raw`와 `dead-letter`다. Graph 기능의 초기 핵심은 현재 semantic model이 고정 ontology인지 동적 관계인지에 따라 달라진다.

- 고정 OWL/semantic model을 import하는 단계: `semantic.graph.rebuild`
- API/UI에서 관계를 실제 변경하는 단계: `semantic.relation.changed`
- graph projection 실패 격리: `semantic.graph.dead-letter`

Topic은 Kafka initialization에서 생성하지만, event는 해당 business change가 실제 발생할 때만 발행한다. 관계 변경 기능이 아직 없는데 빈 형식만 맞추기 위해 relation event를 만들지 않는다.

### 7.2 Partition

- `telemetry.raw` 최소 6 partitions
- partition key 기본값: `deviceId`
- 같은 device event는 같은 partition
- worker 수보다 partition 수가 같거나 많아야 함
- partition 수 변경 전 ordering과 확장 효과를 문서화

### 7.3 Consumer group

```text
group.id = physicalai-telemetry-workers
```

동일 worker image를 최소 2개 실행한다.

```bash
docker compose up -d --scale worker=2
```

확장 실험:

```bash
docker compose up --scale worker=4
```

### 7.4 Offset semantics

자동 offset commit에 의존하지 않는다. 기본 처리 순서는 다음과 같다.

```text
Kafka poll
  → contract validation
  → idempotency check
  → deterministic processing
  → optional Mastra processing
  → PostgreSQL transaction
  → processed result + audit commit
  → Kafka offset commit
```

DB commit 이후 offset commit 전에 죽으면 재전달된다. `eventId` unique constraint와 idempotent handler가 중복 효과를 막아야 한다.

### 7.5 Retry와 DLQ

- 일시적 DB/network 오류: 제한된 exponential backoff
- invalid schema: 즉시 DLQ
- 영구적인 business validation 오류: audit 후 DLQ 또는 rejection topic
- Mastra timeout: 별도 retry policy
- 최대 시도 초과: `dead-letter`
- DLQ message에 original topic, partition, offset, error type, attempts 포함
- poison message가 partition을 영구 정지시키지 않게 함

### 7.6 Topic 생성과 event 발행 시점

Topic 자체는 Compose의 Kafka init service 또는 idempotent initialization script가 생성한다.

```bash
kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --create \
  --if-not-exists \
  --topic semantic.relation.changed \
  --partitions 6 \
  --replication-factor 1
```

`semantic.relation.changed` event는 다음과 같은 구조적 관계가 실제로 생성·변경·삭제될 때 발행한다.

| Business change | Relation example | 최초 처리 주체 |
|---|---|---|
| Device 공장 배치 | `Device-[:LOCATED_IN]->Factory` | Go API |
| Sensor 부착 | `Sensor-[:ATTACHED_TO]->Device` | Go API |
| 담당자 지정 | `Actor-[:RESPONSIBLE_FOR]->Device` | Go API |
| Rule 적용 | `Rule-[:APPLIES_TO]->Device` | Go API |
| Device 의존관계 | `Device-[:DEPENDS_ON]->Device` | Go API 또는 Worker |
| Mastra 관계 제안 승인 | 승인된 관계 | Go API 또는 Worker |

센서 값이 매번 바뀌는 것은 semantic relation change가 아니다. raw temperature, vibration, distance 같은 관측값마다 graph event를 발행하지 않는다.

현재 semantic map이 고정 OWL 파일을 읽는 수준이라면 최초 Rust worker는 `semantic.graph.rebuild`만 처리한다. 이후 관계 mutation API가 생겼을 때 `semantic.relation.changed`를 활성화한다.

---

## 8. MQTT 설계

기존 topic과의 호환을 우선한다. 호환 문제가 없다면 다음 convention을 사용한다.

```text
physicalai/v1/factories/{factoryId}/devices/{deviceId}/telemetry
physicalai/v1/factories/{factoryId}/devices/{deviceId}/status
physicalai/v1/factories/{factoryId}/devices/{deviceId}/commands
physicalai/v1/factories/{factoryId}/devices/{deviceId}/command-results
```

필수 검증:

- QoS 1 duplicate
- reconnect와 resubscribe
- retained status 정책
- Last Will offline 처리
- malformed payload 격리
- topic과 payload identity 불일치 거부
- MQTT callback에서 장시간 처리 금지
- callback은 검증 후 Kafka 발행까지만 담당

---

## 9. Neo4j와 Rust Graph Projection

### 9.1 저장소 역할

Neo4j는 operational source of truth가 아니다. 다음처럼 비교적 안정적인 구조·책임·의존 관계를 조회하는 semantic projection이다.

```text
(:Device)-[:LOCATED_IN]->(:Factory)
(:Sensor)-[:ATTACHED_TO]->(:Device)
(:Device)-[:DEPENDS_ON]->(:Device)
(:Actor)-[:RESPONSIBLE_FOR]->(:Device)
(:Actor)-[:HAS_CAPABILITY]->(:Capability)
(:Rule)-[:APPLIES_TO]->(:Device)
```

Mastra worker는 이상 이벤트를 해석할 때 Neo4j에서 담당자, 영향받는 장치, 적용 rule, capability 등의 semantic context를 조회할 수 있다.

### 9.2 Transactional Outbox

Go API나 NestJS worker가 PostgreSQL과 Neo4j에 동시에 쓰지 않는다. PostgreSQL state와 outbox event를 같은 transaction에 기록한다.

```sql
CREATE TABLE outbox_event (
    event_id        uuid PRIMARY KEY,
    event_type      varchar(120) NOT NULL,
    aggregate_type  varchar(80) NOT NULL,
    aggregate_id    varchar(200) NOT NULL,
    payload         jsonb NOT NULL,
    occurred_at     timestamptz NOT NULL,
    published_at    timestamptz,
    attempts        integer NOT NULL DEFAULT 0,
    last_error      text
);
```

```text
PostgreSQL transaction
├── operational state 변경
└── outbox_event insert
        ↓
Outbox Relay
        ↓
Kafka semantic topic
        ↓
Rust Graph Worker
        ↓
Neo4j
```

Outbox Relay는 초기에는 단일 Go API process의 background component로 구현할 수 있다. 이후 API를 여러 개 띄우면 `FOR UPDATE SKIP LOCKED` 또는 별도 relay service로 중복 claim을 제어한다. 발행 실패 event는 PostgreSQL에 남아 재시도 가능해야 한다.

### 9.3 Rust worker 책임

- `semantic.graph.rebuild`와 `semantic.relation.changed` 소비
- JSON Schema validation
- `eventId` 기반 projection idempotency
- node/relationship upsert 또는 delete
- Neo4j transaction
- batch projection
- retry·DLQ
- projection lag metric
- 전체 graph rebuild

Rust worker의 consumer group은 NestJS worker와 분리한다.

```text
NestJS: physicalai-telemetry-workers
Rust:   physicalai-graph-projectors
```

같은 consumer group에 서로 다른 의미의 worker를 섞으면 partition에 따라 처리 결과가 달라지므로 금지한다.

### 9.4 Relation event 예시

```json
{
  "schemaVersion": 1,
  "eventId": "019...",
  "occurredAt": "2026-08-23T14:20:00Z",
  "operation": "UPSERT_RELATION",
  "subject": { "type": "Actor", "id": "inspection-team" },
  "predicate": "RESPONSIBLE_FOR",
  "object": { "type": "Device", "id": "motor-042" },
  "attributes": { "basis": "manual-assignment" }
}
```

삭제는 `DELETE_RELATION`으로 표현한다. Rust worker는 `MERGE`와 명시적 relationship key를 이용해 재처리에 안전하게 투영한다.

### 9.5 Rebuild

현재 ontology가 고정 파일이라면 다음 흐름부터 구현한다.

```text
Ontology import/rebuild 요청
  → PostgreSQL/outbox 또는 관리 command
  → semantic.graph.rebuild
  → Rust Graph Worker
  → Neo4j projection 재구축
```

Rebuild는 기존 graph를 즉시 삭제한 뒤 장시간 비워두는 방식보다 staging/version 전략을 우선 검토한다. 작은 데모에서는 단순 rebuild를 허용하되 downtime을 문서화한다.

### 9.6 Graph query 경계

- Go API: UI용 read-only graph query endpoint 제공
- Next.js API route: thin BFF로 Go graph endpoint 호출, UI DTO shaping, degraded state 전달
- NestJS/Mastra worker: semantic context query port 사용
- Neo4j Cypher를 domain/Mastra tool 여러 곳에 흩어놓지 않음
- Next.js가 Neo4j driver나 Cypher를 직접 소유하지 않음
- 범용 Cypher proxy 금지. 제품 의미가 있는 query endpoint만 제공
- graph query timeout과 result size 제한
- variable-length traversal 깊이 제한

초기 endpoint 후보:

```text
GET /graph/devices/{deviceId}/impact
GET /graph/devices/{deviceId}/responsibility
GET /graph/rules/{ruleId}/dependencies
GET /graph/events/{eventId}/context
GET /graph/projection/status
```

`/graph/events/{eventId}/context`는 PostgreSQL의 event/causal data와 Neo4j semantic relation을 조합해 Explain/Impact UI에 제공할 수 있다. 단, 조합 책임은 Go Gateway의 application/query service에 두고 Next.js는 read-only response를 렌더링한다.

## 10. NestJS/Mastra Worker 설계

### 10.1 Worker runtime

Worker는 일반 HTTP API server가 아니다. Kafka consumer 중심의 standalone/microservice runtime으로 실행한다.

```typescript
async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WorkerModule,
    kafkaOptions(),
  );

  await app.listen();
}
```

health와 metric이 필요하면 별도 management endpoint 또는 process-level health check를 제공한다.

### 10.2 기존 Mastra 코드 이동

1. 기존 Mastra agent/tool/workflow inventory
2. Next.js server action과 route 종속성 제거
3. SQLite 직접 접근 제거
4. MQTT·Kafka client 직접 생성 제거
5. application port/provider 주입
6. 기존 Zod schema 재사용
7. worker integration test

Mastra tool은 persistence나 protocol implementation을 직접 알지 않는다.

```typescript
export interface OperationalStore {
  getDeviceContext(deviceId: string): Promise<DeviceContext>;
  saveAgentResult(result: AgentResult): Promise<void>;
}

export interface EventPublisher {
  publishAudit(event: AuditEvent): Promise<void>;
}
```

### 10.3 모든 이벤트에 Mastra를 호출하지 않기

```text
telemetry event
  → deterministic validation
  → aggregation/rule
  → requiresAgentReview?
       ├── no  → deterministic persistence
       └── yes → Mastra workflow
```

다음 경우에만 Mastra를 호출한다.

- rule이 agent review를 요구
- 복합 semantic context 해석 필요
- automation proposal 생성
- 자연어 설명 또는 operator recommendation 필요

### 10.4 Mastra 실패 격리

- timeout 필수
- retry 횟수 제한
- model error classification
- structured output validation
- 실패 시 audit evidence
- 다른 partition의 처리를 불필요하게 막지 않음
- 동일 event 재처리 시 외부 side effect 중복 방지
- actuator action은 AI 출력만으로 즉시 실행하지 않고 policy/approval 경계 통과

---

## 11. PostgreSQL의 DynamoDB식 연습

PostgreSQL을 DynamoDB emulator로 주장하지 않는다. 다만 access-pattern-first 모델을 사용해 향후 DynamoDB adapter로 옮기기 쉽게 한다.

### 11.1 Operational item

```sql
CREATE TABLE operational_item (
    pk           varchar(200) NOT NULL,
    sk           varchar(300) NOT NULL,
    entity_type  varchar(50)  NOT NULL,
    payload      jsonb        NOT NULL,
    gsi1_pk      varchar(200),
    gsi1_sk      varchar(300),
    gsi2_pk      varchar(200),
    gsi2_sk      varchar(300),
    version      bigint       NOT NULL DEFAULT 0,
    expires_at   timestamptz,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (pk, sk)
);
```

필요 index:

```sql
CREATE INDEX operational_item_gsi1
  ON operational_item (gsi1_pk, gsi1_sk)
  WHERE gsi1_pk IS NOT NULL;

CREATE INDEX operational_item_gsi2
  ON operational_item (gsi2_pk, gsi2_sk)
  WHERE gsi2_pk IS NOT NULL;
```

모든 데이터를 억지로 한 테이블에 넣지 않는다. migration, outbox, processed-event lock처럼 lifecycle이 다른 데이터는 별도 테이블을 허용한다.

### 11.2 Key convention

```text
PK = FACTORY#{factoryId}
SK = DEVICE#{deviceId}

PK = DEVICE#{deviceId}#DATE#{yyyy-MM-dd}
SK = TELEMETRY#{eventTime}#{eventId}

PK = DEVICE#{deviceId}
SK = COMMAND#{issuedAt}#{commandId}

PK = SUBJECT#{subjectType}#{subjectId}#DATE#{yyyy-MM-dd}
SK = AUDIT#{occurredAt}#{eventId}
```

### 11.3 Idempotency

```sql
CREATE TABLE processed_event (
    event_id       uuid PRIMARY KEY,
    topic          text NOT NULL,
    partition_id   integer NOT NULL,
    kafka_offset   bigint NOT NULL,
    processed_at   timestamptz NOT NULL DEFAULT now()
);
```

처리 결과와 `processed_event` insert는 같은 transaction에 포함한다.

### 11.4 Conditional write

- `INSERT ... ON CONFLICT DO NOTHING`
- `UPDATE ... WHERE version = :expectedVersion`
- 영향받은 행 수로 conflict 판단
- `SELECT 후 INSERT`만으로 중복 방지 금지

### 11.5 Pagination과 TTL

- offset pagination 대신 keyset cursor
- raw telemetry 보관 기간 환경변수
- TTL cleanup은 작은 batch
- audit evidence에는 raw telemetry와 같은 TTL을 적용하지 않음

### 11.6 DynamoDB로 재현할 수 없는 부분

- 실제 physical partition
- adaptive capacity
- RCU/WCU
- GSI asynchronous propagation
- hot partition throttling

이를 README와 ADR에 명시한다.

---

## 12. Next.js 전환

Next.js는 presentation layer로 유지한다.

- PostgreSQL 직접 연결 금지
- Kafka 직접 연결 금지
- Neo4j 직접 연결 금지
- 브라우저 MQTT 직접 연결 금지
- business write는 Go API 사용
- 처리 결과는 REST + SSE/WebSocket으로 수신
- loading/empty/degraded/error 상태 표시
- Go API가 Kafka event를 수락하면 `202 Accepted`와 tracking ID 반환 가능
- 장시간 작업 상태 조회 endpoint 제공
- `/terminal`은 Scene IR을 React/xterm-compatible renderer로 재생
- `/operations`는 worker, partition, lag, retry, DLQ, MQTT 상태를 표시
- `/operations`와 Explain/Impact graph UI는 Next.js API route가 Go Gateway graph query endpoint를 호출해 제공
- Next.js와 SSH action은 동일한 Go application service를 호출
- server component의 단순 조회는 Go REST API를 사용
- 실시간 장면·진행상태는 WebSocket/SSE를 사용

SQLite는 신규 경로가 검증된 뒤 제거한다. 장기간 dual-write하지 않는다.

초기 graph UI 방침:

- Next.js는 Neo4j에 직접 붙지 않는다.
- Next.js API route는 Go Gateway 호출, response mapping, auth/session bridge, degraded UI 상태 전달만 담당한다.
- Go Gateway는 Neo4j connection, Cypher, traversal depth, timeout, result size limit, projection stale 판단을 소유한다.
- 초기 UI 범위는 Operations device/event drill-down과 Explain/Impact context에 한정한다.
- Semantic Explorer 고도화와 AI Copilot graph reasoning은 이후 단계에서 worker 또는 별도 graph query backend 도입을 검토한다.

권장 API 경계:

```text
GET  /api/worlds/{worldId}
GET  /api/scenes/{sceneId}
POST /api/actions
GET  /api/operations/summary
WS   /ws/sessions/{sessionId}
SSH  :2222
```

`POST /api/actions`가 비동기 작업을 발생시키면 `202 Accepted`와 `correlationId`를 반환한다. worker 결과 event는 `sessionId`, `actorId`, `correlationId`를 포함하며 Go가 연결된 WebSocket 또는 SSH session으로 전달한다.

---

## 13. Docker Compose

### 13.1 필수 service

```text
frontend
api
worker × 2 이상
kafka
postgres
mosquitto
migrate
graph-worker × 1             # graph profile
neo4j                        # graph profile
```

### 13.2 Compose 원칙

- 각 runtime은 별도 container
- worker는 하나의 service 정의만 사용
- worker에 `container_name` 금지
- service DNS 사용
- production에서 PostgreSQL/Kafka port 외부 공개 금지
- named volume 사용
- health check
- graceful shutdown
- secret은 `.env.example`에 실제 값 없이 이름만 제공
- SSH host key와 authorized key는 read-only secret/file mount
- SSH port는 기본 `2222`; ALB HTTP listener를 경유하지 않고 EC2 security group 또는 필요 시 NLB TCP listener 사용
- 기본 명령은 repository root에서 실행

```bash
docker compose up -d --scale worker=2
```

Graph projection 포함 실행:

```bash
docker compose --profile graph up -d \
  --scale worker=2 \
  --scale graph-worker=1
```

### 13.3 Worker scale 검증

```bash
docker compose up --scale worker=1
docker compose up --scale worker=2
docker compose up --scale worker=4
```

worker container 이름은 Compose가 자동 생성한다. instance ID, assigned partitions, consumer group generation을 structured log에 기록한다.

### 13.4 Kafka broker profile

상시 데모에서는 단일 Kafka broker를 허용한다. 이는 consumer application의 분산처리를 보여주지만 Kafka broker 자체의 고가용성을 의미하지 않는다.

별도 `kafka-cluster` profile에서 3 broker 실험을 지원할 수 있다.

```text
기본 데모: Kafka broker 1 + Worker 2
분산 실험: Kafka broker 3 + Worker 2~4
```

### 13.5 Graph profile

Neo4j와 Rust graph worker는 2차 계획의 확정 범위에 포함된다. 다만 graph projection은 운영 mode를 분리하기 위해 `graph` profile로 실행할 수 있게 한다. 이는 architecture 축소가 아니라 기본 telemetry demo, graph projection 실험, memory/capacity 측정을 분리하는 운영 전략이다.

```yaml
services:
  neo4j:
    profiles: ["graph"]

  graph-worker:
    profiles: ["graph"]
```

`graph-worker`는 동일 Rust image를 scale할 수 있게 정의하고 `container_name`을 사용하지 않는다.

---

## 14. AWS 배치와 `t3a.medium` 메모리 전략

### 14.1 확정 배치

| Host | Instance | 역할 |
|---|---|---|
| `aws-prod` | `t3a.medium` 유지 | 기존 운영 사이트 전용; 실험 스택 배포 금지 |
| `aws-demo` | `t3a.small → t3a.medium` | Physical AI 분산처리 실험과 데모 |
| `aws-bastion` | 현 상태 유지 | AWS CLI와 관리 진입점 |

측정 당시 `aws-prod`는 container 약 1.25 GiB, host memory used 약 2.0 GiB, swap 약 481 MiB를 사용했으므로 small로 축소하지 않는다. `aws-demo` small은 container 약 531 MiB, available 약 875 MiB였지만 swap 약 1 GiB를 사용했다. 현재 memory PSI는 0이고 지속 swap-out은 없었으나, Kafka·복수 worker 실험을 추가할 공간은 부족하므로 medium으로 변경한다.

서울 리전 Linux On-Demand 기준 small과 medium의 compute 차이는 약 `$17.08/month`이며 환율과 부가세에 따라 대략 월 2.5~2.8만 원이다. EBS와 공인 IPv4 등 공통 비용은 instance type 변경으로 줄거나 늘지 않는다.

### 14.2 Runtime memory budget

2 vCPU, 4 GiB의 `t3a.medium`은 초기 실험 기준이다. 모든 service가 이 instance에서 항상 안정적이어야 한다고 가정하지 않는다. 다음은 목표 범위이며 실제 RSS와 PSI를 측정해 조정한다.

```text
기존 demo containers 약 530 MiB
Next.js             150~300 MiB
Go API               50~120 MiB
NestJS Worker × 2   200~500 MiB
Kafka               450~768 MiB
PostgreSQL          200~350 MiB
Mosquitto            30~80 MiB
Neo4j               512~768 MiB, graph profile에서만
Rust Graph Worker     20~100 MiB
OS/Docker           나머지
```

요구사항:

- EC2에서 application image build 금지
- 로컬 WSL에서 `linux/amd64` image build 후 tar 전송
- worker에 `NODE_OPTIONS=--max-old-space-size=...` 제한
- worker별 DB pool 최소화
- Kafka heap 제한
- PostgreSQL connection 제한
- 불필요한 Kafka UI, Prometheus, Grafana 상시 실행 금지; `/operations`와 CLI metric 우선
- swap은 OOM 완화용일 뿐 정상 메모리로 계산하지 않음
- OOM, sustained swap, memory PSI, CPU credit exhaustion 측정

상시 구성이 medium의 안전 범위를 넘으면 결과를 숨기지 않는다. 이 상황은 범위 축소 실패가 아니라 capacity planning 결과로 기록한다. 다음 중 하나를 선택하고 문서화한다.

1. `aws-demo`를 `t3a.large` 이상으로 승격
2. 상시 데모 traffic과 load-test traffic을 분리
3. 사용하지 않는 기존 demo container를 중지
4. Kafka cluster/관측 도구를 실험 profile로 분리
5. Neo4j와 Rust graph worker를 `graph` profile로 실행하되, graph E2E 검증 시에는 반드시 포함

최종 분산 실험에서는 worker 2개 이상 실행이 필수다.

### 14.3 로컬 build와 tar 배포

application image만 로컬에서 빌드한다. Kafka, PostgreSQL, Mosquitto, Neo4j는 version을 고정한 official image를 사용하고 서버에 이미 존재하면 재전송하지 않는다.

```bash
# Local WSL
docker compose build
docker save \
  physicalai-web:${VERSION} \
  physicalai-api:${VERSION} \
  physicalai-worker:${VERSION} \
  physicalai-graph-worker:${VERSION} \
| zstd -T0 -10 -o physicalai-images-${VERSION}.tar.zst

scp physicalai-images-${VERSION}.tar.zst aws-demo:/tmp/
scp compose.yaml .env.production aws-demo:/opt/physicalai/
```

`.env.production`에는 secret 값을 commit하지 않는다. SSH host private key, DB password 등은 서버에 별도로 배치한다.

```bash
# aws-demo
zstd -dc /tmp/physicalai-images-${VERSION}.tar.zst | sudo docker load
cd /opt/physicalai
sudo docker compose up -d --scale worker=2 --remove-orphans
```

rollback을 위해 직전 image tag와 compose/env 조합을 보존한다. `latest` tag에만 의존하지 않는다.

---

## 15. 테스트

### 15.1 Contract test

- Go validator와 TypeScript validator가 같은 fixture를 동일하게 판정
- schema version
- invalid identity
- timestamp
- unknown field 정책
- payload size

### 15.2 Go API test

- MQTT message → Kafka produce
- Kafka unavailable
- malformed MQTT payload
- API request validation
- PostgreSQL query
- command publish
- SSE disconnect cleanup
- SSH public-key authentication
- SSH PTY/resize/session cleanup
- SSH input → 동일 action service → ANSI result
- `sessionId`/`correlationId` routing

### 15.3 Worker unit test

- idempotency
- ordering/sequence gap
- deterministic rule
- Mastra 호출 조건
- Mastra timeout/error
- structured output validation
- retry classification
- state transition

### 15.4 Integration test

- Kafka + Worker 2개
- PostgreSQL migration
- duplicate event
- DB transaction rollback
- offset commit 전후 장애
- DLQ
- MQTT reconnect
- Next → Go → Kafka → Worker → PostgreSQL E2E
- SSH → Go → Kafka → Worker → PostgreSQL → ANSI response E2E
- 동기 조회가 Kafka 없이 Go → PostgreSQL로 응답하는 E2E
- PostgreSQL state + outbox atomic commit
- outbox publish 실패 후 재시도
- `semantic.graph.rebuild` → Rust worker → Neo4j
- relation event 중복 소비 후 edge 중복 없음
- Neo4j 중단 후 projection 재개

### 15.5 핵심 E2E

```text
Simulator publishes MQTT telemetry
→ Go API validates and publishes Kafka event
→ one of two NestJS workers consumes
→ deterministic rule runs
→ qualifying event invokes Mastra
→ worker persists result and audit
→ Go API exposes result
→ Next.js WebSocket 또는 SSH session이 같은 Scene IR 결과를 수신
```

---

## 16. 필수 분산시스템 실험

### 16.1 Partition 분배

- Worker 2개 시작
- 각 worker assigned partition 기록
- 같은 event가 두 worker에서 정상 처리되지 않음을 확인

### 16.2 Rebalance

- 처리 중 Worker 1 강제 종료
- consumer group rebalance 확인
- 남은 worker의 partition 재할당 확인
- 처리 유실 여부 확인

### 16.3 Duplicate delivery

- 동일 `eventId` 반복 발행
- DB side effect 한 번만 발생
- duplicate metric 증가

### 16.4 Crash window

- DB commit 이후 offset commit 전에 worker 종료를 재현
- 재전달 확인
- idempotency로 중복 effect 방지

### 16.5 Ordering

- 같은 device의 sequence event 발행
- 같은 partition 배치 확인
- out-of-order/late event 정책 확인

### 16.6 Scale-out

다음 결과를 비교한다.

| Workers | Throughput | p95 | p99 | Consumer lag | DB CPU |
|---:|---:|---:|---:|---:|---:|
| 1 | 측정 | 측정 | 측정 | 측정 | 측정 |
| 2 | 측정 | 측정 | 측정 | 측정 | 측정 |
| 4 | 측정 | 측정 | 측정 | 측정 | 측정 |

worker 증가에도 처리량이 늘지 않으면 PostgreSQL, partition 수, producer, CPU 중 병목을 조사한다.

### 16.7 Mastra failure

- LLM timeout
- invalid structured output
- rate limit
- provider 오류
- retry 후 DLQ
- 다른 이벤트 처리 지속 여부

---

## 17. Load test 목표

등록 장치 수와 실제 event rate를 구분한다.

```text
등록 장치: 10,000
상시 데모: 초당 수십 events
Load stage 1: 100 events/sec
Load stage 2: 500 events/sec
Load stage 3: 1,000 events/sec
```

모든 event에 Mastra를 호출하지 않는다. 별도로 agent-trigger 비율을 설정한다.

```text
0%
1%
5%
```

측정 항목:

- produced events/sec
- consumed events/sec
- persisted events/sec
- consumer lag
- p50/p95/p99
- duplicate/rejected/DLQ
- worker별 처리량
- Kafka CPU/memory
- PostgreSQL CPU/connections
- Go API RSS
- Worker RSS
- Mastra invocation/timeout/token usage

---

## 18. 구현 Milestone

별도 Phase 1 제품은 만들지 않는다. 다음은 최종 구조를 완성하기 위한 내부 작업 순서다.

### Milestone 0 — Baseline

- 저장소 조사
- 기존 기능 실행
- `docs/current-state-before-2nd-plan.md`
- MQTT/Mastra/SQLite inventory
- 회귀 기준 확보

### Milestone 1 — Monorepo skeleton

- `api/` Go project
- `worker/` NestJS project
- `contracts/`
- Kafka/PostgreSQL/MQTT Compose
- migration service
- Worker 2개 기동
- Go SSH listener와 session skeleton

완료 조건:

- 모든 container healthy
- Kafka topic 생성
- Worker 2개가 같은 consumer group에 참여

### Milestone 2 — 최소 분산 경로

```text
MQTT → Go → Kafka → Worker × 2 → PostgreSQL
```

- telemetry envelope
- partition key
- idempotent insert
- manual offset commit
- E2E test

완료 조건:

- Go의 PostgreSQL telemetry 우회 저장 없음
- Worker별 partition assignment 확인

### Milestone 3 — Mastra 이동

- 기존 Mastra code inventory
- Next.js 종속성 제거
- Nest provider/port 적용
- 조건부 agent 실행
- timeout/retry/output validation
- audit evidence

완료 조건:

- 기존 대표 Mastra workflow가 Kafka event로 실행
- 일반 telemetry는 LLM 없이 처리

### Milestone 4 — Next.js/SQLite 전환

- Go API endpoint
- PostgreSQL query
- SSE/WebSocket
- Next.js API client 변경
- seed/data migration
- 회귀 후 SQLite 제거
- `/operations` 우선 구현: worker, partition, lag, retry, DLQ, MQTT, processing latency, PostgreSQL 상태 표시
- `/operations` graph drill-down: Next.js API route → Go Gateway → Neo4j read-only query
- Explain/Impact graph context: event 선택 시 PostgreSQL causal data와 Neo4j semantic relation을 Go Gateway에서 조합
- `/terminal` 초기 구현: Scene IR thin React renderer
- SSH 초기 구현: 동일 action contract와 Scene IR을 ANSI thin renderer로 재생
- terminal/SSH cinematic polish는 telemetry path와 operations observability 검증 이후 확장

완료 조건:

- 핵심 화면에 SQLite runtime dependency 없음
- UI가 distributed path의 처리 결과 표시
- `/operations`가 분산 처리 상태와 장애 실험 결과를 확인할 수 있는 1차 관측면 역할을 함
- Next.js가 Neo4j에 직접 연결하지 않고 Go Gateway의 graph query API를 통해 projection을 사용함

### Milestone 5 — 장애·확장 검증

- Worker kill/rebalance
- crash window
- duplicate
- retry/DLQ
- Worker 1/2/4 비교
- 문서와 결과표

### Milestone 6 — Rust/Neo4j semantic projection

- 기존 ontology와 relation mutation 현황 확인
- 고정 ontology이면 `semantic.graph.rebuild` 우선 구현
- 동적 관계가 있으면 transactional outbox 구현
- `semantic.relation.changed` 발행
- Rust graph worker
- Neo4j projection
- duplicate/retry/rebuild test
- `graph` Compose profile

완료 조건:

- Rust worker가 NestJS worker와 다른 consumer group 사용
- PostgreSQL/ontology에서 Neo4j projection 재구축 가능
- 관계 변경 발생 전에는 가짜 relation event를 발행하지 않음

### Milestone 7 — Demo 배포

- local WSL `linux/amd64` production image build
- versioned image tar/zstd 전송과 `docker load`
- health/readiness
- memory limit
- backup/restore
- `aws-demo` t3a.medium smoke/load test
- 기존 demo container와 합산 memory/PSI/swap 측정
- 배포 rollback 문서

---

## 19. 금지되는 구현

```text
Go API ─┬→ Kafka
        └→ PostgreSQL telemetry 저장
```

- Kafka를 단순 audit log로만 사용
- Worker 1개만 최종 결과로 제출
- Worker별 별도 source directory 복제
- 모든 telemetry에 Mastra/LLM 호출
- Kafka offset을 DB commit 전에 commit
- retry 무한 반복
- poison message로 partition 영구 정지
- Next.js에서 DB/Kafka/MQTT 직접 접근
- 모든 Next.js/SSH 요청을 Kafka에 강제로 통과시키기
- NestJS worker container에 SSH listener 포함
- SSH에서 실제 OS shell 노출
- 단순한 Next.js backend 역할로 Spring 추가
- Go와 TypeScript가 서로 다른 message schema 사용
- PostgreSQL과 Neo4j application-level dual-write
- raw telemetry 전체를 Neo4j에 저장
- NestJS telemetry worker와 Rust graph worker를 같은 consumer group에 배치
- 관계 변경이 없는데 `semantic.relation.changed` event를 임의 생성
- container 안에 여러 runtime 강제 결합
- 단일 broker를 Kafka 고가용성이라고 표현
- PostgreSQL 모델을 실제 DynamoDB와 동일하다고 표현
- 확정된 polyglot architecture를 단일 runtime 또는 단일 database application으로 단순화해 대체

---

## 20. 문서 산출물

```text
README.md
docs/current-state-before-2nd-plan.md
docs/architecture.md
docs/message-contracts.md
docs/kafka-partitioning.md
docs/failure-semantics.md
docs/mastra-worker.md
docs/postgresql-access-patterns.md
docs/semantic-graph-projection.md
docs/neo4j-rebuild.md
docs/load-test.md
docs/deployment.md
docs/ssh-terminal.md
docs/scene-ir.md
docs/adr/001-go-ingestion-nest-worker.md
docs/adr/002-at-least-once-idempotency.md
docs/adr/003-postgresql-dynamodb-shaped-access.md
docs/adr/004-neo4j-as-semantic-read-model.md
docs/adr/005-rust-graph-projector.md
docs/adr/006-go-protocol-gateway.md
docs/adr/007-sync-api-vs-kafka-boundary.md
```

README에는 최소 다음 명령을 포함한다.

```bash
docker compose up -d --scale worker=2
docker compose ps
docker compose logs -f api worker kafka
docker compose up --scale worker=4
```

---

## 21. 최종 완료 기준

다음을 모두 만족해야 완료다.

1. 기존 Next.js 주요 UI가 유지된다.
2. Go API가 HTTP, WebSocket/SSE, SSH, MQTT ingress를 담당한다.
3. 대량 telemetry가 Go→Kafka→Worker→PostgreSQL 경로만 사용한다.
4. NestJS/Mastra worker가 동일 image로 최소 2개 실행된다.
5. Kafka topic이 최소 6 partitions를 가진다.
6. 두 worker가 같은 consumer group에서 partition을 나눠 처리한다.
7. 기존 Mastra 대표 workflow가 worker로 이동한다.
8. 일반 telemetry는 조건을 만족할 때만 Mastra를 호출한다.
9. `eventId` 기반 idempotency가 동작한다.
10. DB commit 이후 offset commit 순서를 지킨다.
11. worker 강제 종료 후 rebalance와 복구를 확인한다.
12. 재전달된 event가 중복 side effect를 만들지 않는다.
13. retry와 DLQ가 동작한다.
14. Go와 TypeScript contract test가 통과한다.
15. Next.js가 PostgreSQL·Kafka·MQTT에 직접 접근하지 않는다.
16. SQLite runtime dependency가 제거된다.
17. 로컬에서 빌드한 versioned image를 tar로 전송한 뒤 `docker compose up -d --scale worker=2`로 재현된다.
18. Worker 1/2/4개의 성능 비교 결과가 있다.
19. Mastra timeout과 invalid output 장애 시험이 있다.
20. `aws-demo` t3a.medium에서 기존 container를 포함한 메모리, swap, PSI와 한계를 실제 측정값으로 기록한다.
21. Rust graph worker가 `physicalai-graph-projectors` consumer group으로 실행된다.
22. Neo4j가 PostgreSQL 원본에서 분리된 재생성 가능한 semantic read model이다.
23. 고정 ontology 단계에서는 `semantic.graph.rebuild`가 동작한다.
24. 관계 mutation이 존재하면 outbox를 통해 `semantic.relation.changed`가 발행된다.
25. PostgreSQL state와 outbox insert가 같은 transaction에 포함된다.
26. relation event 중복 소비가 Neo4j edge 중복을 만들지 않는다.
27. `graph` profile에서 Rust worker와 Neo4j E2E test가 통과한다.
28. Next.js와 SSH가 동일한 action/application service를 사용한다.
29. Next.js `/terminal`과 SSH가 동일 Scene IR의 의미와 timeline을 일관되게 표현한다.
30. 동기 조회는 Kafka 없이 응답하고, AI·대량·재처리 작업만 Kafka 경로를 사용한다.
31. SSH는 public-key 인증, session timeout, resize, disconnect cleanup을 지원하며 OS shell을 노출하지 않는다.
32. Spring Boot가 중복 backend로 추가되지 않는다.
33. Go, NestJS/TypeScript, Rust, Kafka, PostgreSQL, MQTT, Neo4j의 runtime 경계와 contract evidence가 문서화된다.
34. `/operations`가 worker partition, lag, retry, DLQ, projection 상태, memory/capacity 관측을 보여주는 primary operations UI로 동작한다.

---

## 22. Codex 최종 보고 형식

1. 구현 결과
2. 최종 아키텍처
3. 주요 변경 파일
4. 실행 방법
5. 테스트 결과
6. Worker partition assignment
7. Rebalance 실험 결과
8. Worker 1/2/4 부하 비교
9. 메모리 사용량
10. Mastra 호출·실패 결과
11. Outbox 발행과 graph projection 결과
12. Neo4j rebuild와 Rust worker retry 결과
13. 남은 위험과 범위 밖 문제
14. 다음 권장 작업 한 가지

테스트하지 않은 내용은 테스트했다고 표현하지 않는다.

---

## 23. Codex 즉시 착수 명령

> 저장소의 지침과 현재 Next.js·SQLite·MQTT·Mastra·ontology 구현을 먼저 조사하라. `docs/current-state-before-2nd-plan.md`를 작성하고 기존 기능 baseline을 검증하라. 그다음 기존 Next.js root 구조를 유지한 채 `api/` Go protocol gateway(HTTP·WebSocket·SSH·MQTT), `worker/` NestJS/Mastra consumer, `contracts/`, Kafka, PostgreSQL, MQTT Compose skeleton을 추가하라. Spring을 중복 backend로 추가하지 말라. 동기 조회와 session 처리는 Kafka를 우회하고, AI·대량·재처리 작업만 Kafka로 보낸다. 초기부터 worker 두 개를 같은 Kafka telemetry consumer group으로 실행하고, telemetry의 정상 쓰기 경로가 반드시 MQTT→Go→Kafka→NestJS Worker→PostgreSQL을 통과하도록 구현하라. Next.js `/terminal`과 SSH는 동일 action contract와 Scene IR을 사용하되 각각 React와 ANSI로 렌더링한다. 핵심 telemetry 경로가 검증된 뒤 `graph-worker/` Rust projector와 Neo4j `graph` profile을 추가하라. 현재 semantic model이 고정 ontology이면 `semantic.graph.rebuild`부터 구현하고, 실제 관계 mutation 기능이 확인된 경우에만 PostgreSQL transactional outbox를 통해 `semantic.relation.changed`를 발행하라. application image는 로컬 WSL에서 `linux/amd64`로 빌드하고 versioned tar.zst로 `aws-demo` t3a.medium에 전송하며 EC2에서는 빌드하지 않는다.
