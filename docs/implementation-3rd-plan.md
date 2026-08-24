# Implementation 3rd Plan: Kubernetes Scaling And Failure Experiments

## 0. 문서 성격

이 문서는 2차 분산 Physical AI 구현과 `aws-demo` 수동 배포 완료 이후에 바로 착수할 3차 계획이다. 기존 Docker Compose 기반 구조를 유지한 채 Kubernetes에서 application workload의 scale-out, self-healing, rolling update, failure timing을 검증한다.

2차 완료 사실은 numbered handoff 문서와 `aws-demo` 배포 완료 기록을 기준으로 판단한다. 이 계획은 4차 industrial edge/production readiness 이전에 Kubernetes orchestration 특성을 먼저 검증하는 단계다.

### 바로 착수 가능 여부

바로 착수 가능하다. 단, 첫 작업은 Kubernetes manifest 작성이 아니라 Go Gateway의 MQTT scale-out 안전성을 먼저 구현하고 검증하는 것이다. Kubernetes 설정은 이 선행 작업과 Compose baseline 준비가 끝난 뒤 시작한다.

착수 전 확인:

- `docker compose config --quiet`
- root/Go/worker/graph-worker의 기존 테스트
- `docker compose --profile graph --profile simulator up -d --build --scale worker=2`
- MQTT command ACK 및 publish-failure lifecycle smoke
- `semantic.graph.rebuild` projection smoke
- `kind` 또는 동등한 local Kubernetes cluster 사용 가능 여부

## 0.1 실행 순서와 단계 게이트

3차 작업은 다음 순서를 고정한다. 앞 단계의 완료 evidence 없이 다음 단계로 넘어가지 않는다.

### Phase 1. Go Gateway MQTT scale-out 선행 작업

Status: completed. Evidence is recorded in `implementation-3rd-001-mqtt-scale-safety-handoff.md`.

Kubernetes 파일을 만들기 전에 다음을 계획하고 구현한다.

1. 현재 MQTT client ID 생성, subscription, reconnect, shutdown 경로를 조사한다.
2. instance identity를 주입할 수 있는 unique client ID 규칙과 configuration contract를 정한다.
3. telemetry subscription에 MQTT shared subscription을 적용하되 command/ACK 등 다른 topic의 소유권과 fan-out 요구는 각각 구분한다.
4. Compose single-instance 기본 동작과 multi-instance 실험 동작을 모두 지원한다.
5. 단위·통합 테스트로 client ID 충돌, shared group 분배, reconnect, QoS 1 duplicate 처리 경계를 검증한다.
6. 결과와 configuration decision을 `implementation-3rd-001-mqtt-scale-safety-handoff.md`에 기록한다.

완료 게이트:

- Gateway replica마다 추적 가능한 MQTT client ID가 생성된다.
- shared subscription을 사용하는 topic과 사용하지 않는 topic이 문서와 설정에서 명확하다.
- Gateway를 Compose에서 2개 이상 실행했을 때 reconnect 경쟁과 단순 duplicate fan-out이 없다.
- 기존 `eventId` 기반 end-to-end idempotency가 유지된다.

### Phase 2. Kubernetes 전 준비 마무리

Status: implemented locally. Runtime and verification evidence is recorded in `implementation-3rd-003-kubernetes-readiness-manifests-handoff.md`; cluster execution remains Phase 4.

Compose baseline 테스트, health/readiness, graceful shutdown, configuration 및 secret 주입 방식, image architecture, 관찰 가능한 instance identity를 정리한다. Kafka partition assignment와 worker idempotency evidence도 이 단계에서 다시 확인한다.

완료 게이트:

- 착수 전 확인 목록이 모두 통과하거나, 미통과 항목과 허용 사유가 기록된다.
- application workload가 외부화된 configuration으로 기동할 수 있다.
- SIGTERM 처리와 readiness 의미가 workload별로 정의된다.
- Compose baseline 결과가 3차 handoff에 남는다.

### Phase 3. Kubernetes 설정 계획 및 작성

Status: plain application manifests written under `k8s/`. They are intentionally not deployment-ready until the maintainer supplies reachable hybrid infrastructure addresses, a real image tag, and the real `semantic-layer-secrets` Secret.

`k8s/` plain manifest의 workload, Service, ConfigMap, Secret example, probe, resource request/limit, rollout 전략을 먼저 설계한 뒤 작성한다. 처음에는 Helm을 도입하지 않는다.

Kafka, PostgreSQL, Mosquitto, Neo4j는 초기 실험에서 기존 Compose infrastructure를 사용할 수 있다. 이 hybrid 연결의 주소, 네트워크 경계, 실패 조건을 manifest 작성 전에 기록한다.

### Phase 4. Kubernetes 전환

먼저 replica 1로 Next.js, Go Gateway, NestJS Worker, Rust Graph Worker를 실행하고 Compose baseline과 기능 동등성을 확인한다. 이후 Go Gateway와 worker를 순서대로 scale-out한다. 전환은 Compose 자산 제거를 의미하지 않는다.

### Phase 5. Kubernetes 테스트와 실험

baseline, scale-out, duplicate injection, Pod failure, Kafka rebalance, commit 경계 장애, rolling update, graceful shutdown 순으로 실험하고 결과를 `docs/kubernetes-experiments.md`에 기록한다.

## 1. 목표

현재 Docker Compose 기반 polyglot distributed system을 유지하면서
Kubernetes에서도 실행·확장하고, 단순 기술 추가가 아니라 실제
scaling/failure 특성을 검증한다.

핵심 검증 범위:

-   Runtime horizontal scaling
-   Pod self-healing 및 rolling update
-   Kafka consumer group rebalance
-   Kafka partition과 consumer replica 관계
-   MQTT ingress horizontal scaling
-   MQTT QoS 1 duplicate handling
-   End-to-end idempotency
-   Graceful shutdown / liveness / readiness
-   장애 복구 및 throughput / latency / lag 관찰

``` text
Devices / Simulator
       │ MQTT
       ▼
   Mosquitto
       │
       ▼
 Go Gateway × N
       │
     Kafka
   ┌───┼────────┐
   ▼   ▼        ▼
Nest  Python   Rust
× N             │
   │             ▼
PostgreSQL     Neo4j

      + Next.js
```

## 2. 기본 원칙

### Docker Compose 유지

Kubernetes는 Compose를 제거하지 않는다.

-   Compose: local development, integration test, debugging,
    single-host/AWS EC2 demo
-   Kubernetes: scaling, self-healing, rolling deployment,
    orchestration/failure experiments

### Compose legacy archive 원칙

Kubernetes 전환 과정에서 기존 Compose 관련 파일과 문서를 삭제하거나 Kubernetes 내용으로 덮어쓰지 않는다.

- `compose.yaml`, `.fordeploy/compose.aws-demo.yaml`, 2차 plan 및 numbered handoff는 검증된 Compose baseline과 AWS EC2 rollback evidence로 보존한다.
- 더 이상 active Kubernetes 경로가 아닌 설명에는 `Legacy / Compose baseline` 또는 `Historical Compose deployment`라고 명시한다.
- 오래된 명령이나 설정을 보존할 때는 실행 가능한 active 절차와 혼동되지 않도록 문서 heading, blockquote, YAML comment 등으로 상태를 표시한다.
- Compose 설정을 실제로 폐기할 필요가 생겨도 3차 작업에서 즉시 삭제하지 않는다. 대체 경로 검증, 참조 검색, rollback 결정 기록을 거친 별도 변경으로 처리한다.
- Compose baseline은 local integration test와 single-host `aws-demo` 운용 경로로 계속 유효하다.

### 과도한 재설계 금지

초기 Kubernetes 대상은 Next.js, Go Gateway, NestJS Worker, Python
Worker/Service, Rust Graph Worker다.

Kafka, PostgreSQL, Neo4j, Mosquitto 같은 stateful infrastructure는
처음부터 Kubernetes 내부로 옮기지 않아도 된다. Application
orchestration부터 검증한다.

## 3. 권장 구조

``` text
k8s/
├── namespace.yaml
├── config/
│   ├── configmap.yaml
│   └── secrets.example.yaml
├── next/
│   ├── deployment.yaml
│   └── service.yaml
├── go-gateway/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── hpa.yaml
├── nest-worker/
│   ├── deployment.yaml
│   └── hpa.yaml
├── python-worker/
│   └── deployment.yaml
├── rust-graph-worker/
│   └── deployment.yaml
└── ingress/
    └── ingress.yaml
```

초기에는 Helm보다 plain Kubernetes manifest를 사용한다. 이후 필요하면
Helm/Kustomize를 검토한다.

## 4. Local Kubernetes

첫 구현은 EKS보다 `kind`를 우선 사용한다. 필요하면 minikube를 대안으로
둔다.

``` bash
kubectl get nodes
kubectl get pods -A
```

프로젝트 전용 namespace 예:

``` yaml
apiVersion: v1
kind: Namespace
metadata:
  name: semantic-layer
```

## 5. Go Gateway 핵심 문제: MQTT Client ID

현재 MQTT adapter가 고정 ID를 사용한다면:

``` go
SetClientID("physicalai-go-gateway")
```

Kubernetes에서 여러 replica가 같은 ID로 접속하면서 기존 connection을
끊고 reconnect 경쟁을 만들 수 있다.

``` text
A connects
→ B connects
→ A disconnected
→ A reconnects
→ B disconnected
→ ...
```

따라서 scale-out 전에 반드시 수정한다.

### 해결: Unique MQTT Client ID

각 Pod는 `INSTANCE_ID`로 주입한 Pod UID를 사용하고, Compose에서는 container hostname으로 fallback한다. 실제 MQTT client ID는 MQTT 3.1.1 portable length를 위해 identity의 짧은 hash로 만든다.

``` text
pago${SHA256(INSTANCE_ID)[0:12]}
```

Pod identity와 연결된 값을 우선 사용하여 운영 중 추적 가능하게 한다.

## 6. Go Gateway 핵심 문제: MQTT Duplicate Fan-Out

Client ID만 고유하게 만들고 모든 replica가 일반 subscription으로 다음을
구독하면:

``` text
devices/+/telemetry
```

동일 telemetry가 각 subscriber에 전달될 수 있다.

``` text
             Mosquitto
                 │
              Event X
          ┌──────┼──────┐
          ▼      ▼      ▼
        Go A   Go B   Go C
          │      │      │
          ▼      ▼      ▼
        Kafka  Kafka  Kafka
             Event X × 3
```

### 해결: MQTT Shared Subscription

``` text
$share/physicalai-telemetry/devices/+/telemetry
$share/physicalai-command-results/devices/+/command-results
```

같은 shared group의 Gateway 중 하나가 메시지를 처리하도록 한다.

``` text
Event 1 → Go A
Event 2 → Go B
Event 3 → Go C
```

Kafka consumer group과 구현은 다르지만 workload distribution 측면에서
유사하다.

권장 configuration:

``` env
MQTT_CLIENT_ID_PREFIX=pago
MQTT_TELEMETRY_SHARED_GROUP=physicalai-telemetry
MQTT_COMMAND_RESULT_SHARED_GROUP=physicalai-command-results
MQTT_TELEMETRY_TOPIC=devices/+/telemetry
MQTT_COMMAND_RESULT_TOPIC=devices/+/command-results
MQTT_COMMAND_LEASE_SECONDS=30
```

Compose single-instance와 Kubernetes multi-instance가 같은 shared subscription configuration을 사용한다. 한 replica만 있을 때도 동일 group의 단일 member로 정상 동작한다.

### MQTT ACK와 Kafka 저장 경계

Go Gateway는 Paho auto-ACK를 끄고 Kafka의 동기 `WriteMessages`가 성공한 뒤에만 MQTT message를 ACK한다. Kafka 응답 유실처럼 저장 여부가 불명확한 실패에서는 MQTT가 재전달할 수 있으므로 exactly-once를 주장하지 않으며, 기존 `eventId`와 `commandId` idempotency가 중복을 흡수한다.

### Outbound command lease와 실제 장치 경계

Gateway가 command를 `publishing`으로 claim한 뒤 종료될 수 있으므로 PostgreSQL에 `dispatch_owner`와 `lease_until`을 기록한다. 만료된 lease는 다른 Gateway가 회수한다. Timeout과 synthetic failure result도 atomic claim을 사용한다.

이 lease 회수는 command 재발행 가능성을 의도적으로 허용한다. Python simulator는 process memory에서 `commandId`별 결과를 cache하여 같은 process 안에서는 물리 상태 변경을 한 번만 수행하고 기존 ACK를 재전송한다. 실제 device는 아직 구현 범위 밖이며 다음 요구사항이 남아 있다.

- 최근 `commandId`와 최종 ACK payload를 device의 durable local storage에 bounded retention으로 저장한다.
- 같은 `commandId`를 받으면 actuator를 다시 동작시키지 않고 저장된 ACK를 재전송한다.
- device reboot 및 network reconnect 뒤에도 이 기록이 유지되는지 검증한다.
- 이 작업 전에는 실제 장치 command 경로의 end-to-end idempotency가 완료됐다고 주장하지 않는다.

## 7. QoS 1과 End-to-End Idempotency

Shared Subscription을 사용해도 QoS 1은 `at least once`이므로 duplicate
delivery 가능성이 있다.

목표는 duplicate를 완전히 제거하는 것이 아니라 duplicate가 발생해도
business state가 깨지지 않게 하는 것이다.

Telemetry에는 immutable `eventId`를 둔다.

``` json
{
  "eventId": "01JABC...",
  "deviceId": "TEMP-001",
  "timestamp": "2026-08-23T09:00:00Z",
  "temperature": 83.2
}
```

가능하면 eventId는 Gateway보다 event origin에 가까운 곳에서 생성한다.
동일 physical event의 재전송에는 동일 eventId를 유지한다.

``` text
Device / Simulator
       │ eventId=X
       ▼
 MQTT QoS 1
       ▼
 Go Gateway × N
       ▼
     Kafka
       ▼
NestJS Worker × N
       ▼
 PostgreSQL
       ▼
 UNIQUE(eventId)
```

기록 권장:

-   received event count
-   duplicate event count
-   persisted unique event count
-   duplicate suppression count

## 8. Go Gateway Scaling Experiment

처음에는 replica 1로 기존 동작을 검증한 후:

``` bash
kubectl scale deployment go-gateway --replicas=3
```

검증한다.

-   MQTT Client ID uniqueness
-   동시 connection 안정성
-   reconnect war 부재
-   Shared Subscription 동작
-   telemetry distribution
-   Kafka publish count
-   duplicate count

현재 Go application이 HTTP ingestion과 MQTT subscription을 동시에
담당한다면 초기에는 하나의 Deployment로 유지한다. 독립 scaling 필요성이
확인되면 `go-http-gateway`와 `go-mqtt-gateway`로 분리한다.

## 9. NestJS Kafka Worker Scaling

모든 replica는 동일 Kafka consumer group을 사용한다.

``` text
group.id = semantic-worker
```

6 partitions / 3 workers 예:

``` text
Worker A → P0, P1
Worker B → P2, P3
Worker C → P4, P5
```

Kafka가 Kubernetes를 직접 인식하는 것은 아니다. 새 Pod의 consumer가 같은
group에 join하면 Kafka가 membership 변화를 감지하고 rebalance한다.

다음 순서로 실험한다.

``` text
replicas: 1 → 2 → 3 → 6 → 8
```

측정:

-   consumer count
-   partition assignment
-   rebalance
-   throughput
-   consumer lag
-   CPU / memory
-   PostgreSQL write rate

특히 partitions=6, consumers=8에서 추가 consumer가 idle이 되는 것을
확인한다.

## 10. Self-Healing Experiment

NestJS worker 하나를 강제로 제거한다.

``` bash
kubectl delete pod <nest-worker-pod>
```

관찰:

``` text
Pod failure
→ desired-state violation
→ replacement Pod
→ Kafka membership change
→ rebalance
→ partition reassignment
→ processing resumes
```

측정:

-   Pod recreation time
-   rebalance duration
-   processing interruption
-   lag increase / recovery
-   duplicate count

Go Gateway도 같은 방식으로 제거하여 remaining shared subscribers가
processing을 계속하고 replacement Pod가 unique Client ID로 다시
join하는지 확인한다.

## 11. Failure Timing Experiment

### Case A: DB commit 전 kill

``` text
Kafka consume
→ processing
→ worker kill
→ no DB commit
```

재처리되는지 확인한다.

### Case B: DB commit 후 offset commit 전 kill

``` text
Kafka consume
→ DB commit
→ worker kill
→ offset not committed
```

동일 message가 재처리되어도 `UNIQUE(eventId)` 등으로 duplicate business
record가 생기지 않아야 한다.

## 12. Rolling Update

``` text
v1 v1 v1
→ v1 v1 v2
→ v1 v2 v2
→ v2 v2 v2
```

검증:

-   HTTP downtime
-   MQTT connection churn
-   Kafka rebalance
-   processing interruption
-   message loss / duplicate
-   DB consistency

특히 MQTT Gateway update 중 remaining replicas가 shared traffic을
이어받는지 확인한다.

## 13. Graceful Shutdown

Go Gateway:

``` text
SIGTERM
→ stop new HTTP requests
→ stop MQTT subscription
→ flush Kafka producer
→ disconnect MQTT
→ close Kafka
→ exit
```

NestJS Worker:

``` text
SIGTERM
→ stop new Kafka records
→ finish/safely abort current work
→ handle offset
→ disconnect Kafka
→ close DB
→ exit
```

초기값:

``` yaml
terminationGracePeriodSeconds: 30
```

## 14. Liveness / Readiness

HTTP workload에는 예를 들어:

``` text
/health/live
/health/ready
```

를 둔다.

-   Liveness: 프로세스가 살아 있는가?
-   Readiness: 현재 traffic을 받아도 되는가?

Kafka/MQTT/PostgreSQL의 짧은 장애를 곧바로 liveness failure로 처리하여
restart storm을 만들지 않는다.

## 15. Service / HPA

HTTP inbound가 필요한 workload만 Kubernetes Service를 둔다. Background
Kafka consumer에는 불필요한 Service를 만들지 않는다.

HTTP workload에는 CPU 등의 metric을 이용한 HPA를 실험할 수 있다.

Kafka worker는 CPU만 보고 무한 scale-out하지 않는다. Partition이 6개라면
consumer 20개를 만들어도 추가 parallelism이 생기지 않을 수 있다.

향후 Kafka-aware autoscaling에서는 다음을 검토한다.

-   consumer lag
-   partition count
-   active consumer count
-   processing latency

## 16. Observability

최소한 다음을 활용한다.

``` bash
kubectl get pods
kubectl describe pod ...
kubectl logs ...
kubectl top pod
```

로그에는 가능하면 다음 identity를 포함한다.

-   Pod / instance
-   MQTT Client ID
-   Kafka consumer ID
-   eventId
-   partition
-   offset

목표는 하나의 event를 다음처럼 추적할 수 있게 하는 것이다.

``` text
Device
→ MQTT
→ Go Pod B
→ Kafka P3 offset 18432
→ Nest Worker Pod D
→ PostgreSQL
```

## 17. AWS 단계

Local Kubernetes 검증 완료 전 EKS를 우선하지 않는다.

``` text
Docker Compose
→ kind
→ Kubernetes manifests
→ scaling/failure experiments
→ stable local Kubernetes
→ AWS deployment 검토
```

AWS에서는 필요하면 application workload를 EKS에 두고 Kafka/MSK,
PostgreSQL/RDS 등 stateful infrastructure를 managed service로 분리하는
방안을 검토한다.

비용 대비 가치가 낮으면 기존 EC2 demo를 유지해도 된다.

## 18. 필수 검증 시나리오

1.  Compose MQTT Preflight: Go=2 이상에서 unique Client ID와 Shared Subscription 검증
2.  Compose Baseline: Go=1, Nest=1 정상 처리와 기존 회귀 테스트
3.  Kubernetes Baseline: Go=1, Nest=1 기능 동등성
4.  Go Gateway Scale-Out: 1→3 + unique Client ID + Shared Subscription
5.  Kafka Worker Scale-Out: 1→3→6
6.  Consumer Over-Scaling: partitions=6, workers=8
7.  Nest Worker Failure: Pod kill + recreation + Kafka rebalance
8.  MQTT Gateway Failure: Go Pod kill + shared subscriber continuity
9.  Duplicate Injection: 동일 eventId 반복 전송 후 `received > 1`,
    `persisted = 1` 확인
10. DB Commit / Offset Commit Failure: 재처리 후 DB consistency 확인
11. Rolling Update: v1→v2 중 processing continuity 확인

## 19. 완료 조건

-   [ ] 기존 Docker Compose 환경이 정상 동작한다.
-   [ ] 기존 Compose 파일과 문서가 legacy baseline 및 rollback evidence로 보존된다.
-   [ ] Kubernetes manifest 작성 전에 MQTT scale-out 선행 작업이 Compose에서 검증된다.
-   [ ] Local Kubernetes에서 application workload가 실행된다.
-   [x] Go Gateway가 unique MQTT Client ID를 사용한다.
-   [x] MQTT Shared Subscription이 적용된다.
-   [x] Go Gateway를 Compose runtime에서 scale-out할 수 있다.
-   [x] Gateway 증가가 단순 duplicate fan-out을 만들지 않는다.
-   [ ] MQTT QoS 1 duplicate가 end-to-end idempotency로 처리된다.
-   [ ] NestJS Kafka worker를 runtime에서 scale-out/in할 수 있다.
-   [ ] Kafka partition/consumer 관계를 실제 확인했다.
-   [ ] Pod kill 후 Kubernetes self-healing을 확인했다.
-   [ ] Kafka rebalance와 lag recovery를 관찰했다.
-   [ ] DB commit/offset commit 경계 장애를 실험했다.
-   [ ] Rolling update를 검증했다.
-   [ ] Graceful shutdown을 검증했다.
-   [ ] 주요 실험 결과가 `docs/kubernetes-experiments.md`에 기록되어
    있다.

## 20. 최종 산출물

Kubernetes 구현 완료 후 repo에는 최소 다음 evidence가 남아야 한다.

``` text
k8s/
docs/
  implementation-3rd-plan.md
  kubernetes-experiments.md
```

`kubernetes-experiments.md`에는 단순 명령어 기록이 아니라 다음을 남긴다.

-   실험 목적
-   architecture / configuration
-   workload
-   예상 결과
-   실제 결과
-   throughput / latency / lag
-   failure/recovery timeline
-   발견한 문제
-   수정 내용
-   architecture decision

최종 목표는 README에 단순히 `Kubernetes`라고 적는 것이 아니라 다음과
같은 주장을 실제 실험으로 뒷받침하는 것이다.

> Horizontally scaled polyglot event-processing system using Kubernetes,
> Kafka consumer groups and MQTT shared subscriptions, with failure
> recovery and end-to-end idempotency verified under at-least-once
> delivery.
