# 2nd Implementation 001: Scaffolding Handoff

## 문서 목적

이 문서는 `docs/implementation-2nd-plan.md`의 첫 실행 단계로 수행한 polyglot
distributed monorepo 스캐폴딩과 telemetry vertical slice의 실제 작업 결과를
기록한다.

- `docs/implementation-2nd-plan.md`: 확정된 2차 확장 계획
- `docs/current-state.md`: 스캐폴딩 시작 전 저장소 상태
- 이 문서: 첫 스캐폴딩에서 실제 생성ㆍ구현ㆍ검증한 내용과 후속 작업 경계

문서에서 `완료` 또는 `검증`이라고 표현하는 항목은 로컬 Docker 환경에서
직접 실행해 확인한 범위만 의미한다. 파일이나 책임 경계만 만든 부분은
명시적으로 skeleton 또는 placeholder라고 표시한다.

## 유지한 아키텍처 원칙

- 기존 Next.js 애플리케이션은 저장소 루트에 유지했다. `frontend/`로 옮기지
  않았다.
- 대량 telemetry의 목표 정상 경로는
  `MQTT -> Go Gateway -> Kafka -> NestJS/Mastra Worker x N -> PostgreSQL`이다.
- Kafka는 동기 RPC bus로 사용하지 않는다.
- PostgreSQL은 authoritative operational store다.
- Neo4j는 PostgreSQL과 이벤트로부터 재생성 가능한 semantic read model이다.
- telemetry 처리는 exactly-once를 주장하지 않고 at-least-once delivery,
  idempotency, 처리 성공 후 manual offset commit을 사용한다.
- 모든 telemetry에 Mastra 또는 LLM을 호출하지 않는다.
- worker는 하나의 service/image이며 `docker compose up --scale worker=2`로
  확장할 수 있다. worker에는 `container_name`을 지정하지 않았다.
- Spring Boot는 추가하지 않았다.

## 1. 작업 전 저장소 조사

코드 수정 전에 다음 문서를 읽고 기존 구현을 조사했다.

1. `README.md`
2. `docs/implementation-1st-plan.md`
3. `docs/implementation-2nd-plan.md`
4. `docs/ontology-modeling-notes.md`

조사 결과는 `docs/current-state.md`에 기록했다. 주요 inventory 범위는 다음과
같다.

- 루트 Next.js App Router와 API route
- SQLite, Drizzle schema와 store boundary
- `workspace-runtime`, simulator adapter와 deterministic rule engine
- SSE event stream
- 기존 Mastra Explain Event workflow와 LLM provider boundary
- 2차 계획 대비 누락된 service, contract, infrastructure

`docs/current-state.md`는 작업 전 시점 기록이므로 이 문서의 완료 상태와 섞어
갱신하지 않는다.

## 2. 언어 중립 계약 스캐폴딩

`contracts/`를 JSON Schema source of truth 위치로 만들고 다음 계약을
추가했다.

- `telemetry.schema.json`
- `command.schema.json`
- `command-result.schema.json`
- `agent-result.schema.json`
- `audit-event.schema.json`
- `semantic-relation.schema.json`
- `graph-rebuild.schema.json`
- `scene-ir.schema.json`
- `action-request.schema.json`
- `session-result.schema.json`

현재 telemetry envelope는 `telemetry.v1`이며 주요 필드는 `eventId`,
`deviceId`, `sensorId`, `sequence`, `measuredAt`, `payload`다. 이 계약은 Go,
TypeScript, 향후 Rust consumer가 동일한 메시지 의미를 공유하기 위한
경계다.

현재 payload 직렬화 형식은 UTF-8 JSON이다. Kafka wire protocol 자체의
바이너리 framing과 domain payload 형식은 별개다.

## 3. Go Gateway 스캐폴딩

`api/`에 Go Gateway 프로젝트를 추가했다.

구현한 항목:

- 환경설정 로딩
- HTTP server와 graceful shutdown
- `GET /health`
- `GET /ready`
- `POST /telemetry`
- `GET /graph/projection/status`
- `kafka-go` 기반 Kafka producer
- Docker multi-stage build

`POST /telemetry`는 telemetry envelope를 받아 검증하고 `telemetry.raw`
topic에 발행한다. Go Gateway는 raw telemetry를 PostgreSQL에 직접 저장하지
않는다.

Kafka record 구성:

- topic: `telemetry.raw`
- key: `deviceId`
- value: UTF-8 JSON으로 직렬화한 `telemetry.v1`
- headers: `schemaVersion`, `eventId`

같은 `deviceId`를 key로 사용해 Kafka hash partitioning에서 같은 device의
이벤트가 같은 partition으로 배치되도록 했다.

`api/internal/mqtt/listener.go`와 `api/internal/ssh/server.go`는 책임 위치와
lifecycle을 표현하는 skeleton이다. 실제 MQTT subscribe/publish bridge와
application-controlled SSH terminal session은 아직 구현하지 않았다.

## 4. Go, Kafka, NestJS Worker 간 통신

Go와 NestJS worker는 서로 직접 HTTP 또는 gRPC 호출을 하지 않는다. 양쪽이
Kafka broker에 연결하며 Kafka wire protocol로 비동기 통신한다.

```text
Go TelemetryEvent
  -> JSON marshal
  -> kafka-go Produce API
  -> Kafka telemetry.raw partition
  -> KafkaJS Fetch/poll
  -> Buffer를 UTF-8 JSON으로 변환
  -> JSON.parse와 telemetry validation
  -> NestJS TelemetryEvent
```

계층을 구분하면 다음과 같다.

| 구분 | 현재 선택 |
| --- | --- |
| domain contract | versioned JSON Schema, `telemetry.v1` |
| record payload | UTF-8 JSON |
| messaging protocol | Apache Kafka wire protocol |
| transport | TCP/IP |

Kafka의 Produce API는 HTTP REST endpoint가 아니다. Kafka가 정의한 바이너리
application protocol의 request type이다. `kafka-go`가 Produce request를,
KafkaJS가 consumer group, Fetch와 OffsetCommit request를 처리한다.

Kafka protocol은 Kafka 생태계의 전용 protocol이며 gRPC를 사용하지 않는다.
향후 payload를 Protobuf나 Avro로 바꾸더라도 Kafka protocol과 payload
serialization은 별도 결정이다.

## 5. NestJS Worker 스캐폴딩

`worker/`에 HTTP server가 없는 NestJS application context를 추가했다.
Kafka가 worker의 HTTP endpoint를 호출하는 구조가 아니라 worker가 broker에
연결해 topic을 지속적으로 consume한다.

구현한 항목:

- NestJS dependency injection application context
- KafkaJS consumer
- `telemetry.raw` subscription
- 같은 consumer group을 사용하는 scale-out worker
- telemetry JSON parsing과 validation
- PostgreSQL persistence
- `autoCommit: false`
- persistence 성공 후 manual offset commit
- broker startup 지연에 대한 consumer retry
- 조건부 Mastra 진입 boundary
- Docker multi-stage build

consumer의 처리 순서는 다음과 같다.

```text
consumer.connect
  -> consumer group 참가
  -> telemetry.raw partition 배정
  -> Kafka Fetch/poll
  -> eachMessage
  -> telemetry validation
  -> PostgreSQL transaction
  -> 처리 성공
  -> offset + 1 commit
```

worker가 둘이면 Kafka가 `telemetry.raw` partition을 같은 consumer group의
두 인스턴스에 나눠 배정한다. 별도 HTTP load balancer는 필요하지 않다.

현재 worker에서 Go로 직접 돌아가는 response channel은 없다. 향후 처리 결과가
필요하면 `command.result`, `agent.result` 같은 result topic에 publish하거나
PostgreSQL authoritative state를 Go query API가 조회한다. 동기 조회와 가벼운
명령은 Kafka를 RPC처럼 사용하지 않고 Go의 HTTP/WebSocket/SSE 경계를 사용한다.

## 6. At-least-once와 Idempotency

PostgreSQL migration에 다음 operational table을 추가했다.

- `telemetry_event`
- `audit_event`
- `outbox_event`

`telemetry_event.event_id`에는 unique constraint가 있다. worker는 telemetry를
저장할 때 `ON CONFLICT (event_id) DO NOTHING`을 사용한다.

현재 처리 보장은 다음 조합이다.

```text
Kafka at-least-once delivery
+ eventId unique constraint
+ idempotent insert
+ PostgreSQL 처리 성공 후 manual offset commit
```

PostgreSQL commit 이후 Kafka offset commit 전에 worker가 종료되면 같은 메시지가
재전달될 수 있다. 재전달은 unique event ID로 중복 저장을 막는다. 이것을
exactly-once라고 표현하지 않는다.

## 7. Infrastructure 스캐폴딩

`infra/`에 다음 항목을 추가했다.

- PostgreSQL initial migration과 migration runner
- Kafka topic initialization script
- Mosquitto configuration
- Neo4j configuration 위치와 안내

생성하도록 선언한 Kafka topic:

- `telemetry.raw`
- `command.result`
- `agent.result`
- `audit.event`
- `dead-letter`
- `semantic.graph.rebuild`
- `semantic.relation.changed`

이 중 현재 telemetry vertical slice에서 실제 사용한 topic은
`telemetry.raw`다. 나머지는 후속 producer/consumer를 위한 contract boundary다.

## 8. Rust Graph Worker 스캐폴딩

`graph-worker/`에 Rust projector 프로젝트를 추가했다.

- Rust executable skeleton
- consumer module boundary
- projection module boundary
- Neo4j module boundary
- Docker multi-stage build
- graph worker consumer group 설정 위치

목표 경로는 다음과 같다.

```text
semantic.graph.rebuild / semantic.relation.changed
  -> Rust graph worker
  -> Neo4j projection update
```

현재 Rust binary는 실행되지만 실제 Kafka consume과 Neo4j Cypher projection은
구현하지 않았다. Neo4j read model의 rebuild와 stale 판단도 후속 범위다.

## 9. Compose 구성과 컨테이너 수

루트 `compose.yaml`에 다음 service를 추가했다.

- `frontend`
- `api`
- `worker`
- `postgres`
- `migrate`
- `kafka`
- `kafka-init`
- `mosquitto`
- graph profile의 `neo4j`
- graph profile의 `graph-worker`

worker를 두 개로 scale한 기본 stack은 총 9개 컨테이너를 생성한다.

| service | 생성 수 | 정상 상태 |
| --- | ---: | --- |
| frontend | 1 | 상시 실행 |
| api | 1 | 상시 실행 |
| worker | 2 | 상시 실행 |
| postgres | 1 | 상시 실행 |
| kafka | 1 | 상시 실행 |
| mosquitto | 1 | 상시 실행 |
| migrate | 1 | 완료 후 종료 |
| kafka-init | 1 | 완료 후 종료 |

따라서 기본 stack은 총 9개 생성, 초기화 완료 후 7개 상시 실행이다.

graph profile까지 사용하면 `neo4j`와 `graph-worker`가 추가되어 총 11개 생성,
9개 상시 실행이다. 현재 Compose를 graph profile과 함께 단일 `aws-demo` EC2에
그대로 배포하면 이 구성이 같은 인스턴스에서 실행된다.

컨테이너 수보다 Kafka, PostgreSQL, Neo4j, Next.js와 worker 2개의 실제 메모리
사용량이 capacity 판단에 중요하다. `t3a.medium`은 초기 실험 기준이며 graph
profile까지 단일 호스트에서 운용할 때 `t3a.large` 이상으로 조정하는 것은
계획에 부합하는 정상적인 capacity adjustment다.

## 10. Docker Build와 WSL 설치 경계

Go SDK, Rust toolchain, PostgreSQL, Neo4j와 JVM을 로컬 WSL에 직접 설치하지
않았다. 빌드와 service runtime은 Docker image 안에서 해결했다.

| 대상 | builder 또는 source image | 최종 runtime |
| --- | --- | --- |
| Go Gateway | `golang:1.22-alpine` | `alpine:3.20` + Go binary |
| Rust graph worker | `rust:1.83-alpine`, `musl-dev` | `alpine:3.20` + Rust binary |
| NestJS worker | `node:22-alpine` | `node:22-alpine` + production dependencies |
| Next.js frontend | `node:22-alpine`, Python, Make, g++ | `node:22-alpine` + standalone output |
| PostgreSQL | `postgres:16-alpine` | 공식 image 내부 server/runtime |
| Kafka | `apache/kafka:3.8.0` | 공식 image 내부 Kafka/JVM |
| Neo4j | `neo4j:5-community` | 공식 image 내부 Neo4j/JVM |
| MQTT | `eclipse-mosquitto:2` | 공식 image 내부 broker |

Go와 Rust는 multi-stage build이므로 최종 runtime image에는 Go SDK, Cargo나
compiler가 들어가지 않는다. Next.js의 `better-sqlite3` native module 빌드에
필요한 Python, Make와 C++ compiler도 builder stage에만 존재한다.

WSL 또는 EC2 host에는 이 service들의 언어 SDK와 database server를 직접
설치할 필요가 없다. 현재 배포 모델에서 host에 필요한 기본 실행 기반은
Docker와 Compose다.

PostgreSQL 확인도 WSL에 `psql`을 설치해 수행하지 않고 PostgreSQL 컨테이너
내부의 `psql`을 `docker compose exec`로 실행했다.

## 11. Next.js와 Go 통신 경계

계획상 Next.js와 Go Gateway의 동기 통신은 HTTP/JSON REST를 기본으로 한다.
실시간 session과 상태에는 WebSocket 또는 SSE를 사용할 수 있다.

```text
Browser
  -> Next.js UI
  -> Next.js thin BFF API route
  -> Go Gateway HTTP read/query endpoint
```

Next.js는 Kafka나 Neo4j에 직접 연결하지 않는다. graph query에서 Go가 Neo4j
driver, Cypher, traversal depth, timeout, result size와 projection stale 판단을
소유한다.

현재 Go에는 health, readiness, telemetry ingestion과 projection status
placeholder endpoint가 있지만 Next.js thin BFF와 계획된 graph drill-down
endpoint들은 아직 구현하지 않았다.

## 12. 실제 검증한 Vertical Slice

로컬 Compose에서 다음 경로를 실제 실행했다.

```text
HTTP POST /telemetry
  -> Go Gateway
  -> Kafka telemetry.raw
  -> NestJS worker x 2
  -> PostgreSQL telemetry_event
```

smoke event에 대해 Go가 queued response를 반환했고 PostgreSQL에서 같은
`eventId`, device, sensor, sequence와 payload가 저장된 것을 확인했다.

Kafka consumer group을 조회해 6개 partition이 두 worker에 3개씩 배정되고,
처리된 partition의 lag가 0인 것도 확인했다.

이 검증은 HTTP ingress부터 시작했다. 따라서 다음 전체 목표 경로를 검증한
것으로 표현하면 안 된다.

```text
MQTT -> Go -> Kafka -> Worker -> PostgreSQL
```

MQTT subscriber가 아직 skeleton이므로 검증한 정확한 범위는
`Go HTTP -> Kafka -> Worker -> PostgreSQL`이다.

## 13. 수행한 빌드와 테스트

다음 검증을 실제 수행해 통과했다.

- root Next.js `npm run lint`
- root Next.js production build
- 기존 Node test 10개
- NestJS worker TypeScript build
- Go Gateway Docker image build
- Rust graph worker Docker image build
- Next.js frontend Docker image build
- NestJS worker Docker image build
- `docker compose config`
- `docker compose up -d --scale worker=2`
- Go HTTP -> Kafka -> worker -> PostgreSQL smoke test
- worker 2개의 Kafka partition assignment 확인

Go와 Cargo는 WSL에 설치하지 않았기 때문에 host에서 직접 `go test`나
`cargo check`를 실행하지 않았다. Go와 Rust는 Docker build로 컴파일 가능성을
검증했다.

검증 후 Compose container와 테스트 volume은 `docker compose down -v`로
제거했다. pull/build된 Docker image cache는 남아 있을 수 있다.

## 14. 아직 구현하지 않은 부분

다음 항목은 완료로 간주하지 않는다.

- 실제 MQTT subscriber와 MQTT -> Go -> Kafka 경로
- SSH public key authentication, PTY와 application-controlled terminal session
- 기존 Mastra Explain workflow의 worker runtime 이식
- 실제 LLM/Mastra 조건부 실행과 결과 topic publish
- dead-letter 및 retry policy의 완성
- command와 agent result producer/consumer
- Rust Kafka consumer
- Neo4j projection write와 rebuild
- Go graph impact/responsibility/dependencies/context endpoint
- Next.js thin BFF와 `/operations` graph drill-down UI
- PostgreSQL로 기존 SQLite operational state 완전 이전
- worker crash window, duplicate delivery, rebalance와 부하 테스트
- AWS `aws-demo` 실제 배포와 메모리/PSI 측정

## 15. 다음 구현 권장 순서

1. Go MQTT subscriber를 구현하고 HTTP ingestion과 동일한 telemetry validation 및
   Kafka producer boundary를 재사용한다.
2. Go와 TypeScript가 `contracts/telemetry.schema.json`에 동일하게 순응하는
   contract test를 추가한다.
3. worker의 validation failure와 processing failure를 retry/dead-letter 정책에
   연결한다.
4. 기존 deterministic rule과 조건부 Mastra workflow를 worker runtime으로
   이동한다.
5. Rust worker에서 `semantic.graph.rebuild` consume과 Neo4j projection을
   구현한다.
6. Go의 제한된 read-only graph endpoint와 Next.js thin BFF를 연결한다.
7. worker scale, duplicate delivery, crash recovery, rebalance와 capacity를
   반복 검증한다.

## 변경 파일 요약

새로 추가한 주요 경로:

- `contracts/`
- `api/`
- `worker/`
- `infra/`
- `graph-worker/`
- `compose.yaml`
- root `Dockerfile`
- `docs/current-state.md`
- 이 handoff 문서

기존 파일 중 스캐폴딩 연결을 위해 변경한 주요 파일:

- `.env.example`
- `tsconfig.json`

`.fordeploy/deploy.sh`의 기존 또는 이후 사용자 변경은 이 작업 범위에서
수정하거나 되돌리지 않는다.
