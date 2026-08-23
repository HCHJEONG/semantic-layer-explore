# Implementation 4th Plan: Industrial Edge And Production Readiness

## 0. 문서 성격

이 문서는 2차 분산 Physical AI 구현과 3차 Kubernetes scaling/failure 실험 이후, 시스템을 실제 공장 현장에 연결하기 위한 4차 계획이다. 현재 코드가 이미 production-ready라는 의미가 아니다. 2차 구현의 완료 사실은 numbered handoff 문서, 특히 `implementation-2nd-015-mqtt-outbound-failure-ux-handoff.md`를 기준으로 판단한다.

4차의 핵심은 Python simulator를 삭제하는 것이 아니라 **운영 데이터 경로에서 실제 industrial edge adapter로 교체**하는 것이다. Simulator는 contract test, demo, 장애 주입용 reference device로 계속 사용할 수 있다.

현재 확정된 중앙 처리 구조는 유지한다.

```text
MQTT -> Go Gateway -> Kafka -> NestJS/Mastra Worker x N -> PostgreSQL
PostgreSQL outbox -> Rust Graph Worker -> Neo4j projection
Browser -> Next.js thin BFF -> Go -> PostgreSQL/Neo4j
```

Spring Boot와 Kotlin은 4차 기본 범위에 포함하지 않는다. 새 JVM transactional domain core가 실제 요구사항으로 확인될 때만 별도 ADR로 검토한다.

## 1. 목표 운영 형태

```text
Sensors / PLC / Actuators
  -> OPC UA / Modbus TCP-RTU / vendor protocol
  -> Industrial PC edge adapter
       - protocol normalization
       - local safety boundary
       - disk-backed buffer
       - device identity and heartbeat
  -> Factory Mosquitto with mTLS and ACL
  -> Go / Kafka / NestJS / PostgreSQL
```

중앙 시스템 장애가 설비의 기본 안전 동작을 막아서는 안 된다. Emergency stop, PLC interlock, 수동 운전 우선권, 즉시 보호 동작은 edge/PLC에 남긴다. 중앙 rule과 AI는 안전 제어기를 대체하지 않는다.

## 2. 현재 기준선

이미 구현되거나 로컬 검증된 범위:

- Versioned MQTT telemetry, command, command-result JSON contract
- Go MQTT subscriber와 outbound command dispatcher
- Bounded publish retry, ACK timeout, negative ACK, idempotent finalization
- Kafka at-least-once 처리와 PostgreSQL idempotency
- NestJS deterministic rule processing 및 conditional Mastra workflow
- PostgreSQL authoritative store와 SQLite 제거
- Rust 기반 Neo4j rebuild projection과 제한된 Go graph read
- 기존 UI의 command lifecycle, event timeline, causal Explain evidence
- Python simulator의 telemetry, virtual-device state, ACK 및 실패 주입

아직 production-ready로 보지 않는 핵심 이유:

- 실제 PLC/센서 protocol adapter가 없음
- MQTT mTLS, 장치별 ACL, certificate lifecycle이 없음
- broker 및 장치의 실시간 연결 상태 모델이 없음
- edge store-and-forward와 장기 offline 복구가 없음
- MQTT ACK와 물리적 동작 완료가 구분되지 않음
- OT safety interlock과 승인 정책이 없음
- HA, backup/restore drill, production observability가 충분하지 않음

## 3. 설계 원칙

1. Read-only telemetry부터 시작하고 actuator write는 뒤에 연다.
2. PLC/edge의 safety logic을 중앙 LLM이나 Kafka workflow로 옮기지 않는다.
3. 실제 장치도 simulator와 동일한 versioned contract를 사용한다.
4. Vendor protocol과 중앙 domain contract 사이에 명시적인 adapter를 둔다.
5. 모든 외부 입력을 신뢰하지 않고 schema, identity, timestamp, range를 검증한다.
6. MQTT와 WAN이 끊겨도 edge가 bounded disk queue로 telemetry를 보존한다.
7. Command는 TTL, causation, idempotency key, authorization evidence를 가진다.
8. `accepted`, `executing`, `completed`, `failed`를 구분한다.
9. PostgreSQL이 authoritative하고 Neo4j는 계속 rebuildable projection이다.
10. Exactly-once를 주장하지 않는다. 중복과 재전송을 견디는 설계를 검증한다.
11. AI는 설명과 제안에 사용하고 safety-critical actuation의 단독 승인자가 되지 않는다.
12. 한 번에 공장 전체로 확대하지 않고 line/cell 단위 rollout gate를 사용한다.

## 4. Milestone 1: 현장 조사와 계약 동결

### 범위

- 대상 공장, line, cell, PLC, sensor, actuator inventory
- OPC UA, Modbus, EtherNet/IP 등 실제 protocol과 vendor SDK 조사
- Tag/address, engineering unit, sampling rate, quality code, writable 여부 수집
- Factory network zone, DMZ, firewall, outbound route, DNS/NTP 조사
- 현장 Mosquitto version, listener, authentication, bridge/cluster 구성 확인
- Existing telemetry/command/result schema와 실제 tag mapping 정의
- Device ID, asset ID, topic naming, certificate identity 규칙 확정

### 산출물

- Asset/tag registry 초안
- Protocol-to-MQTT mapping 문서
- Topic ACL matrix
- Network/data-flow diagram
- 위험 분석과 read/write 허용 목록

### 완료 gate

- 한 종류의 sensor를 read-only로 연결할 수 있는 정보가 모두 확보됨
- 실제 장치 데이터가 기존 contract로 손실 없이 표현됨
- 쓰기 명령은 아직 비활성 상태임

## 5. Milestone 2: Industrial Edge Adapter

### 책임

- PLC/vendor protocol session 관리
- Raw tag를 domain telemetry envelope로 변환
- Unit conversion, range validation, quality code 보존
- Device timestamp와 edge receive timestamp 분리
- Stable event ID와 sequence 생성
- MQTT reconnect와 resubscribe
- Disk-backed store-and-forward
- Heartbeat 및 adapter health publish
- Command deduplication과 TTL 확인

언어는 현장 SDK와 운영성에 따라 결정한다. 기존 Go gateway와 같은 언어를 반드시 강제하지 않는다. Python simulator 구현을 복사해 production adapter로 사용하지 않는다.

### Offline 정책

- Queue 최대 크기와 최대 보존 시간을 설정한다.
- Disk full 이전에 backpressure와 alarm을 발생시킨다.
- 재연결 시 device별 순서를 가능한 범위에서 유지한다.
- 오래된 command는 재실행하지 않고 만료 결과를 반환한다.
- Telemetry replay에는 original measured time과 replay marker를 보존한다.

### 완료 gate

- 네트워크 단절과 재연결 후 유실/중복/순서 측정 결과가 있음
- Edge process restart 후 queue 복구가 검증됨
- Simulator와 실제 edge adapter가 같은 contract tests를 통과함

## 6. Milestone 3: MQTT Identity And OT Security

### 범위

- TLS 1.2 이상과 가능하면 mutual TLS
- Industrial PC 또는 device별 certificate identity
- Topic별 publish/subscribe ACL
- Anonymous listener 제거
- Certificate 발급, 배포, rotation, expiry alert, revocation 절차
- Secret을 source, Compose file, image에 넣지 않는 운영 방식
- IT/OT segmentation, DMZ, firewall allowlist, outbound-only route 검토
- Broker audit log와 connection event 보존

### ACL 예시

```text
edge/site-a/line-1 publish devices/line-1/+/telemetry
edge/site-a/line-1 publish devices/line-1/+/command-results
edge/site-a/line-1 subscribe devices/line-1/+/commands
central-go subscribe devices/+/telemetry
central-go subscribe devices/+/command-results
central-go publish devices/+/commands
```

### 완료 gate

- 잘못된 certificate와 금지 topic 접근이 차단됨
- Certificate rotation 중 telemetry 중단 시간이 측정됨
- Broker 설정과 비밀정보 복구 절차가 문서화됨

## 7. Milestone 4: Live Connectivity And Device Registry

현재 UI의 MQTT adapter 표시는 broker의 실시간 health 증명이 아니다. 이를 실제 운영 상태로 교체한다.

### 상태 모델

```text
commissioning -> online -> stale -> offline
                         -> maintenance
                         -> decommissioned
```

### 수집 항목

- Go broker connection/reconnect 상태
- Device/edge heartbeat와 last-seen
- Last telemetry/ACK timestamp
- Firmware/adapter version
- Certificate expiry
- Queue depth와 oldest buffered event age
- Clock skew와 quality degradation

### UI

- 기존 Operations 화면에 broker, edge, device 상태를 밀도 있게 표시
- Stale/offline 이유와 마지막 정상 시각 제공
- 연결 장애와 개별 command 실패를 구분
- 운영자가 maintenance를 선언하고 이력을 남길 수 있게 함

### 완료 gate

- Broker stop, cable loss, edge process crash를 서로 구분해 표시
- Heartbeat 누락이 설정된 시간 안에 stale/offline으로 전환됨
- SSE reconnect 후 상태가 authoritative store에서 복구됨

## 8. Milestone 5: Safe Command Lifecycle

### 확장 contract

```text
queued -> published -> accepted -> executing -> completed
                                      -> failed
       -> expired / rejected / cancelled
```

`accepted`는 command 수신이고 `completed`는 feedback sensor 또는 PLC state로 물리적 완료가 확인된 상태다.

### 필수 제어

- Command TTL과 deadline
- Expected current state 또는 optimistic concurrency token
- Device-side idempotency
- User/service identity와 authorization evidence
- Rule version과 causation trace
- Maintenance/manual mode 차단
- PLC interlock 결과
- Two-person approval이 필요한 위험 command 분류
- Cancellation 또는 명시적 compensation 정책
- Desired state, reported state, confirmed physical state 분리

### 완료 gate

- 중복, 지연, 역순 command가 안전하게 처리됨
- ACK 후 actuator failure를 별도 실패로 관찰 가능
- Manual override와 emergency stop이 중앙 command보다 우선함
- 위험 command는 승인 없이 실행되지 않음

## 9. Milestone 6: Observability And Operations

### Metrics와 trace

- MQTT connect/reconnect, publish error, ACK latency
- Device heartbeat age와 edge queue depth
- Kafka throughput, consumer lag, rebalance
- Worker processing latency, retry, DLQ
- PostgreSQL pool, query latency, storage growth
- Rust projection lag/rebuild duration
- End-to-end correlation: sensor -> rule -> command -> physical completion

OpenTelemetry와 Prometheus-compatible metrics를 우선 검토한다. 로그만으로 운영 가능하다고 가정하지 않는다.

### 운영 기능

- DLQ 조회, 승인형 replay, replay audit
- Alert routing과 담당자 ownership
- Runbook: broker down, Kafka lag, DB saturation, edge offline, certificate expiry
- SLO 및 error budget 초안

### 완료 gate

- 장애 주입 후 dashboard/alert가 원인을 제한 시간 안에 보여줌
- 하나의 correlation ID로 end-to-end trace를 재구성할 수 있음
- Replay가 원본 event를 덮어쓰거나 중복 command를 실행하지 않음

## 10. Milestone 7: HA, Backup, Recovery, And Deployment

### 범위

- Mosquitto 운영 topology 또는 broker 대안의 HA 요구사항 검증
- Kafka replication, retention, disk capacity policy
- PostgreSQL backup, PITR, restore rehearsal
- Go/worker scale-out 및 rolling update
- Edge version compatibility와 staged rollout
- Signed image, SBOM, vulnerability scanning
- Config/schema migration rollback
- Capacity test와 CPU/memory/I/O/PSI 측정

### 완료 gate

- PostgreSQL restore와 Neo4j full rebuild가 실제로 수행됨
- Worker 또는 Go instance 장애 중 처리가 회복됨
- Previous application/edge release로 rollback 가능
- Retention과 disk-full alarm이 부하 테스트에서 검증됨

## 11. 도입 단계

1. Lab에서 simulator와 실제 edge adapter contract parity를 검증한다.
2. 공장 한 cell의 한 sensor를 read-only shadow mode로 연결한다.
3. Dashboard와 alarm만 운영하고 자동 command를 금지한다.
4. 비위험 actuator에 operator 승인형 command를 연다.
5. Physical completion feedback과 interlock을 검증한다.
6. 제한된 deterministic rule automation을 단계적으로 허용한다.
7. HA, backup/restore, security review, 장애 훈련 후 line 범위를 확대한다.

각 단계는 관찰 기간과 rollback 기준을 가진다. 다음 단계로 넘어가는 것은 기능 구현 완료가 아니라 측정된 운영 gate 통과로 결정한다.

## 12. 명시적 비범위

- LLM이 PLC safety logic을 직접 생성하거나 실행하는 기능
- Kafka 또는 중앙 cloud가 emergency stop을 담당하는 구조
- Neo4j를 telemetry 또는 command의 source of truth로 사용하는 구조
- 검증 없이 공장 전체 actuator를 자동화하는 big-bang rollout
- 단지 기술 스택을 늘리기 위한 Kotlin/Spring Boot 추가
- Vendor protocol을 일반 문자열 parsing으로 임시 처리하는 구현

## 13. 최종 완료 기준

4차는 다음 조건을 모두 증명해야 완료로 본다.

1. 실제 sensor telemetry가 industrial edge와 mTLS MQTT를 거쳐 기존 중앙 경로에 저장된다.
2. Edge offline buffering과 replay의 유실/중복 특성이 측정되어 있다.
3. 장치 identity, ACL, certificate rotation이 검증되어 있다.
4. Broker/edge/device live state가 UI와 alert에 표시된다.
5. 비위험 actuator command가 authorization, TTL, idempotency, interlock을 거친다.
6. Accepted ACK와 physical completion이 분리되어 기록된다.
7. End-to-end trace와 causal Explain이 실제 장치 증거를 사용한다.
8. DLQ replay, backup restore, Neo4j rebuild, service failure recovery가 훈련되었다.
9. Capacity와 SLO가 측정값으로 기록되어 있다.
10. 현장 운영 runbook, rollback, 책임자, 보안 검토가 문서화되어 있다.
