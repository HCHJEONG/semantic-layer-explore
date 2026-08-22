# Distributed Physical AI 확장 작업지시서

## 0. 문서 성격

이 문서는 현재 `physicalai.penvot.com`에 배포된 Semantic Layer Explore 저장소를 **분산 Physical AI 처리 시스템**으로 확장하기 위한 Codex 작업지시서다.

이 파일은 저장소 루트에 그대로 배치한다.

작업의 최종 목표는 다음 구조를 실제로 구현하고 검증하는 것이다.

```text
Next.js
  + Go API/Gateway × 1
  + MQTT Broker
  + Kafka
  + NestJS/Mastra Worker × 2 이상
  + PostgreSQL
```

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
14. 테스트하지 않은 사항을 완료했다고 보고하지 않는다.
15. 실제 저장소와 이 문서의 가정이 다르면 실제 코드를 우선하되, 아키텍처 핵심을 바꿔야 할 경우 먼저 보고한다.

---

## 3. 먼저 조사할 현재 상태

코드를 수정하기 전에 `docs/current-state.md`를 작성한다.

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
  ├── MQTT inbound/outbound adapter
  ├── schema validation
  ├── Kafka producer
  ├── configuration command handling
  ├── PostgreSQL query adapter
  └── SSE/WebSocket result delivery
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
           │
           ▼
      Go Query API
           │
           ▼
        Next.js
```

### 4.1 Go API 책임

- HTTP API와 ingress
- MQTT 연결과 장치 통신
- payload envelope 기본 검증
- 인증·인가·rate limit 경계
- Kafka 발행
- 장치/공장/규칙 설정 CRUD
- 처리 결과 조회
- actuator command 발행
- SSE 또는 WebSocket delivery

Go API는 Mastra workflow를 실행하지 않는다.

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
├── contracts/                    # 언어 중립 계약
│   ├── telemetry.schema.json
│   ├── command.schema.json
│   ├── command-result.schema.json
│   ├── agent-result.schema.json
│   └── audit-event.schema.json
│
├── infra/
│   ├── postgres/
│   │   └── migrations/
│   ├── kafka/
│   │   └── config/
│   └── mosquitto/
│       └── config/
│
├── loadtest/
├── docs/
├── compose.yaml
├── .env.example
├── .dockerignore
├── DISTRIBUTED_PHYSICAL_AI_IMPLEMENTATION.md
└── README.md
```

기존 `hooks/`, `styles/`, `types/`, `ontology/`, `scripts/` 등이 있으면 그대로 유지한다.

### 5.1 Build 경계

- root Dockerfile: Next.js만 build
- `api/Dockerfile`: Go API만 build
- `worker/Dockerfile`: NestJS/Mastra worker만 build
- Kafka, PostgreSQL, MQTT를 application image에 포함하지 않음
- root `compose.yaml`이 조합
- root `.dockerignore`에서 `api/`, `worker/`, DB volume, build output 제외 검토
- 각 하위 build context에 맞는 `.dockerignore` 추가 가능

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
command.result
agent.result
audit.event
dead-letter
```

초기 핵심은 `telemetry.raw`와 `dead-letter`다. 필요하지 않은 topic을 형식적으로 만들지 않는다.

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
docker compose up --build --scale worker=2
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

## 9. NestJS/Mastra Worker 설계

### 9.1 Worker runtime

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

### 9.2 기존 Mastra 코드 이동

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

### 9.3 모든 이벤트에 Mastra를 호출하지 않기

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

### 9.4 Mastra 실패 격리

- timeout 필수
- retry 횟수 제한
- model error classification
- structured output validation
- 실패 시 audit evidence
- 다른 partition의 처리를 불필요하게 막지 않음
- 동일 event 재처리 시 외부 side effect 중복 방지
- actuator action은 AI 출력만으로 즉시 실행하지 않고 policy/approval 경계 통과

---

## 10. PostgreSQL의 DynamoDB식 연습

PostgreSQL을 DynamoDB emulator로 주장하지 않는다. 다만 access-pattern-first 모델을 사용해 향후 DynamoDB adapter로 옮기기 쉽게 한다.

### 10.1 Operational item

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

### 10.2 Key convention

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

### 10.3 Idempotency

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

### 10.4 Conditional write

- `INSERT ... ON CONFLICT DO NOTHING`
- `UPDATE ... WHERE version = :expectedVersion`
- 영향받은 행 수로 conflict 판단
- `SELECT 후 INSERT`만으로 중복 방지 금지

### 10.5 Pagination과 TTL

- offset pagination 대신 keyset cursor
- raw telemetry 보관 기간 환경변수
- TTL cleanup은 작은 batch
- audit evidence에는 raw telemetry와 같은 TTL을 적용하지 않음

### 10.6 DynamoDB로 재현할 수 없는 부분

- 실제 physical partition
- adaptive capacity
- RCU/WCU
- GSI asynchronous propagation
- hot partition throttling

이를 README와 ADR에 명시한다.

---

## 11. Next.js 전환

Next.js는 presentation layer로 유지한다.

- PostgreSQL 직접 연결 금지
- Kafka 직접 연결 금지
- 브라우저 MQTT 직접 연결 금지
- business write는 Go API 사용
- 처리 결과는 REST + SSE/WebSocket으로 수신
- loading/empty/degraded/error 상태 표시
- Go API가 Kafka event를 수락하면 `202 Accepted`와 tracking ID 반환 가능
- 장시간 작업 상태 조회 endpoint 제공

SQLite는 신규 경로가 검증된 뒤 제거한다. 장기간 dual-write하지 않는다.

---

## 12. Docker Compose

### 12.1 필수 service

```text
frontend
api
worker × 2 이상
kafka
postgres
mosquitto
migrate
```

### 12.2 Compose 원칙

- 각 runtime은 별도 container
- worker는 하나의 service 정의만 사용
- worker에 `container_name` 금지
- service DNS 사용
- production에서 PostgreSQL/Kafka port 외부 공개 금지
- named volume 사용
- health check
- graceful shutdown
- secret은 `.env.example`에 실제 값 없이 이름만 제공
- 기본 명령은 repository root에서 실행

```bash
docker compose up --build --scale worker=2
```

### 12.3 Worker scale 검증

```bash
docker compose up --scale worker=1
docker compose up --scale worker=2
docker compose up --scale worker=4
```

worker container 이름은 Compose가 자동 생성한다. instance ID, assigned partitions, consumer group generation을 structured log에 기록한다.

### 12.4 Kafka broker profile

상시 데모에서는 단일 Kafka broker를 허용한다. 이는 consumer application의 분산처리를 보여주지만 Kafka broker 자체의 고가용성을 의미하지 않는다.

별도 `kafka-cluster` profile에서 3 broker 실험을 지원할 수 있다.

```text
기본 데모: Kafka broker 1 + Worker 2
분산 실험: Kafka broker 3 + Worker 2~4
```

---

## 13. `t3a.small` 메모리 전략

2 vCPU, 2 GiB에서 다음 전체 구성이 항상 안정적이라고 가정하지 않는다. 먼저 제한하고 측정한다.

대략적 목표:

```text
Next.js             200~300 MiB
Go API               50~120 MiB
NestJS Worker × 2   200~500 MiB
Kafka               450~650 MiB
PostgreSQL          200~350 MiB
Mosquitto            30~80 MiB
OS/Docker           나머지
```

요구사항:

- production build만 서버에서 실행
- 로컬에서 image build 후 배포 가능
- worker에 `NODE_OPTIONS=--max-old-space-size=...` 제한
- worker별 DB pool 최소화
- Kafka heap 제한
- PostgreSQL connection 제한
- 불필요한 Kafka UI, Prometheus, Grafana 상시 금지
- swap은 OOM 완화용일 뿐 정상 메모리로 계산하지 않음
- OOM, sustained swap, CPU credit exhaustion 측정

상시 구성이 2 GiB를 넘으면 결과를 숨기지 않는다. 다음 중 하나를 선택하고 문서화한다.

1. 상시 데모에서 traffic을 낮춤
2. 실험할 때만 instance를 확대
3. Kafka cluster/관측 도구를 실험 profile로 분리

최종 분산 실험에서는 worker 2개 이상 실행이 필수다.

---

## 14. 테스트

### 14.1 Contract test

- Go validator와 TypeScript validator가 같은 fixture를 동일하게 판정
- schema version
- invalid identity
- timestamp
- unknown field 정책
- payload size

### 14.2 Go API test

- MQTT message → Kafka produce
- Kafka unavailable
- malformed MQTT payload
- API request validation
- PostgreSQL query
- command publish
- SSE disconnect cleanup

### 14.3 Worker unit test

- idempotency
- ordering/sequence gap
- deterministic rule
- Mastra 호출 조건
- Mastra timeout/error
- structured output validation
- retry classification
- state transition

### 14.4 Integration test

- Kafka + Worker 2개
- PostgreSQL migration
- duplicate event
- DB transaction rollback
- offset commit 전후 장애
- DLQ
- MQTT reconnect
- Next → Go → Kafka → Worker → PostgreSQL E2E

### 14.5 핵심 E2E

```text
Simulator publishes MQTT telemetry
→ Go API validates and publishes Kafka event
→ one of two NestJS workers consumes
→ deterministic rule runs
→ qualifying event invokes Mastra
→ worker persists result and audit
→ Go API exposes result
→ Next.js updates UI
```

---

## 15. 필수 분산시스템 실험

### 15.1 Partition 분배

- Worker 2개 시작
- 각 worker assigned partition 기록
- 같은 event가 두 worker에서 정상 처리되지 않음을 확인

### 15.2 Rebalance

- 처리 중 Worker 1 강제 종료
- consumer group rebalance 확인
- 남은 worker의 partition 재할당 확인
- 처리 유실 여부 확인

### 15.3 Duplicate delivery

- 동일 `eventId` 반복 발행
- DB side effect 한 번만 발생
- duplicate metric 증가

### 15.4 Crash window

- DB commit 이후 offset commit 전에 worker 종료를 재현
- 재전달 확인
- idempotency로 중복 effect 방지

### 15.5 Ordering

- 같은 device의 sequence event 발행
- 같은 partition 배치 확인
- out-of-order/late event 정책 확인

### 15.6 Scale-out

다음 결과를 비교한다.

| Workers | Throughput | p95 | p99 | Consumer lag | DB CPU |
|---:|---:|---:|---:|---:|---:|
| 1 | 측정 | 측정 | 측정 | 측정 | 측정 |
| 2 | 측정 | 측정 | 측정 | 측정 | 측정 |
| 4 | 측정 | 측정 | 측정 | 측정 | 측정 |

worker 증가에도 처리량이 늘지 않으면 PostgreSQL, partition 수, producer, CPU 중 병목을 조사한다.

### 15.7 Mastra failure

- LLM timeout
- invalid structured output
- rate limit
- provider 오류
- retry 후 DLQ
- 다른 이벤트 처리 지속 여부

---

## 16. Load test 목표

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

## 17. 구현 Milestone

별도 Phase 1 제품은 만들지 않는다. 다음은 최종 구조를 완성하기 위한 내부 작업 순서다.

### Milestone 0 — Baseline

- 저장소 조사
- 기존 기능 실행
- `docs/current-state.md`
- MQTT/Mastra/SQLite inventory
- 회귀 기준 확보

### Milestone 1 — Monorepo skeleton

- `api/` Go project
- `worker/` NestJS project
- `contracts/`
- Kafka/PostgreSQL/MQTT Compose
- migration service
- Worker 2개 기동

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

완료 조건:

- 핵심 화면에 SQLite runtime dependency 없음
- UI가 distributed path의 처리 결과 표시

### Milestone 5 — 장애·확장 검증

- Worker kill/rebalance
- crash window
- duplicate
- retry/DLQ
- Worker 1/2/4 비교
- 문서와 결과표

### Milestone 6 — 운영 배포

- production images
- health/readiness
- memory limit
- backup/restore
- t3a.small smoke test
- 배포 rollback 문서

---

## 18. 금지되는 구현

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
- Go와 TypeScript가 서로 다른 message schema 사용
- container 안에 여러 runtime 강제 결합
- 단일 broker를 Kafka 고가용성이라고 표현
- PostgreSQL 모델을 실제 DynamoDB와 동일하다고 표현

---

## 19. 문서 산출물

```text
README.md
docs/current-state.md
docs/architecture.md
docs/message-contracts.md
docs/kafka-partitioning.md
docs/failure-semantics.md
docs/mastra-worker.md
docs/postgresql-access-patterns.md
docs/load-test.md
docs/deployment.md
docs/adr/001-go-ingestion-nest-worker.md
docs/adr/002-at-least-once-idempotency.md
docs/adr/003-postgresql-dynamodb-shaped-access.md
```

README에는 최소 다음 명령을 포함한다.

```bash
docker compose up --build --scale worker=2
docker compose ps
docker compose logs -f api worker kafka
docker compose up --scale worker=4
```

---

## 20. 최종 완료 기준

다음을 모두 만족해야 완료다.

1. 기존 Next.js 주요 UI가 유지된다.
2. Go API가 HTTP와 MQTT ingress를 담당한다.
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
17. `docker compose up --build --scale worker=2`로 재현된다.
18. Worker 1/2/4개의 성능 비교 결과가 있다.
19. Mastra timeout과 invalid output 장애 시험이 있다.
20. `t3a.small` 결과와 메모리 한계를 실제 측정값으로 기록한다.

---

## 21. Codex 최종 보고 형식

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
11. 남은 위험과 범위 밖 문제
12. 다음 권장 작업 한 가지

테스트하지 않은 내용은 테스트했다고 표현하지 않는다.

---

## 22. Codex 즉시 착수 명령

> 저장소의 지침과 현재 Next.js·SQLite·MQTT·Mastra 구현을 먼저 조사하라. `docs/current-state.md`를 작성하고 기존 기능 baseline을 검증하라. 그다음 기존 Next.js root 구조를 유지한 채 `api/` Go gateway, `worker/` NestJS/Mastra consumer, `contracts/`, Kafka, PostgreSQL, MQTT Compose skeleton을 추가하라. 초기부터 worker 두 개를 같은 Kafka consumer group으로 실행하고, telemetry의 정상 쓰기 경로가 반드시 MQTT→Go→Kafka→NestJS Worker→PostgreSQL을 통과하도록 구현하라.

