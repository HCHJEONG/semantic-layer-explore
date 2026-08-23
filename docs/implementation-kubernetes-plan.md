# implementation-kubernetes-plan.md

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

각 Pod는 고유 ID를 사용한다.

``` text
physicalai-go-gateway-${HOSTNAME}
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
$share/go-gateway/devices/+/telemetry
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
MQTT_CLIENT_ID_PREFIX=physicalai-go-gateway
MQTT_SHARED_GROUP=go-gateway
MQTT_TOPIC=devices/+/telemetry
MQTT_QOS=1
MQTT_SHARED_SUBSCRIPTION=true
```

Compose single-instance와 Kubernetes multi-instance를 모두 지원하도록
shared subscription 여부를 설정으로 분리한다.

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

1.  Baseline: Go=1, Nest=1 정상 처리
2.  Kafka Worker Scale-Out: 1→3→6
3.  Consumer Over-Scaling: partitions=6, workers=8
4.  Go Gateway Scale-Out: 1→3 + unique Client ID + Shared Subscription
5.  Nest Worker Failure: Pod kill + recreation + Kafka rebalance
6.  MQTT Gateway Failure: Go Pod kill + shared subscriber continuity
7.  Duplicate Injection: 동일 eventId 반복 전송 후 `received > 1`,
    `persisted = 1` 확인
8.  DB Commit / Offset Commit Failure: 재처리 후 DB consistency 확인
9.  Rolling Update: v1→v2 중 processing continuity 확인

## 19. 완료 조건

-   [ ] 기존 Docker Compose 환경이 정상 동작한다.
-   [ ] Local Kubernetes에서 application workload가 실행된다.
-   [ ] Go Gateway가 unique MQTT Client ID를 사용한다.
-   [ ] MQTT Shared Subscription이 적용된다.
-   [ ] Go Gateway를 runtime에서 scale-out할 수 있다.
-   [ ] Gateway 증가가 단순 duplicate fan-out을 만들지 않는다.
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
  implementation-kubernetes-plan.md
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
