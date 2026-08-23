# 2nd Implementation 002: AWS Demo Deployment Preparation

## 문서 목적

이 문서는 `docs/implementation-2nd-001-scaffolding-handoff.md` 이후 수행한
`aws-demo` 배포 준비 작업을 기록한다. 이 단계에서는 배포 스크립트와 AWS
capacity를 준비했지만, 새 Physical AI Compose stack 자체는 아직 배포하지
않았다.

실제 production 배포는 maintainer가 수동으로 수행한다. 에이전트는 배포
스크립트를 실행하지 않는다.

## 1. 기존 AWS 상태 점검

배포 전 `ssh aws-bastion`과 bastion의 `aws-demo` alias를 사용해 읽기 전용으로
점검했다.

점검 당시 `aws-demo` 상태:

- instance ID: `i-0fa95bb4eff77caf2`
- private IP: `172.31.76.194`
- instance type: `t3a.small`
- memory: 약 1.9 GiB
- available memory: 약 881 MiB
- swap: 2 GiB 중 약 1.07 GiB 사용
- root disk: 39 GiB 중 13 GiB 사용
- memory PSI: 지속 pressure는 없었음

기존 실행 컨테이너는 6개였다.

| Container | Image | Host ports |
| --- | --- | --- |
| `phpsucks-wordpress-1` | `phpsucks:aws20260821151307` | `8090 -> 80` |
| `spring-is-cool` | `spring-is-cool:20260821122156` | `8080`, `2222` |
| `phpsucks-db-1` | `mysql:8.4` | internal only |
| `cobolai` | `legacy-lang-intelligence:20260819103120` | `3300 -> 3000` |
| `pricingai` | `global-ai-pricing:20260819101734` | `3400 -> 3000` |
| `ai-physical-workspace` | `ai-physical-workspace:aws20260819100555` | `3010 -> 3000` |

## 2. EC2 Capacity Adjustment

전체 graph-profile stack은 worker 2개를 포함해 11개 container를 생성하고,
초기화 container 종료 후 9개가 상시 실행된다. 기존 6개 서비스가 함께 있는
`t3a.small`에서 먼저 실행하는 것은 OOM과 swap thrashing 위험이 크다고
판단했다.

다음 절차를 실제 수행했다.

1. 기존 6개 Docker container 정상 정지
2. EC2 instance 정지
3. AWS CLI로 `t3a.small -> t3a.medium` 변경
4. EC2 instance 시작
5. AWS instance status check 통과 확인
6. MySQL을 먼저 시작해 healthy 확인
7. 나머지 기존 container 5개 재시작
8. 기존 Physical AI 공개 URL 복구 확인

변경 후 상태:

- instance type: `t3a.medium`
- private IP: `172.31.76.194` 유지
- memory: 약 3.87 GiB
- 기존 서비스 복구 후 available memory: 약 2.42 GiB
- swap used: 0 MiB
- memory PSI: `avg10`, `avg60`, `avg300` 모두 0
- `https://physicalai.penvot.com/`: HTTP 200
- `https://physicalai.penvot.com/api/ready`: HTTP 200

이 수치는 새 Compose stack 배포 전 기준이다. 전체 stack 배포 후 다시
측정해야 한다.

## 3. 배포 모델 변경

기존 `.fordeploy/deploy.sh`는 source archive를 EC2로 보내고 Next.js image 하나를
EC2에서 빌드했다. 이 로직은 스크립트 하단의 inert legacy reference block으로
보존했다.

활성 배포 로직은 다음 방식으로 변경했다.

1. 로컬 WSL에서 `linux/amd64` application image 4개 빌드
2. 공식 infrastructure image 4개를 로컬에서 pull
3. 고유 image 8개를 하나의 versioned archive로 저장
4. `aws-bastion -> aws-demo` 경로로 image와 Compose bundle 전송
5. EC2에서는 build/pull 없이 `docker load`
6. graph profile과 `worker=2`로 Compose 실행
7. frontend/API/public URL readiness 확인
8. 실패 시 기존 release 또는 legacy container rollback

고유 image 8개가 container 11개를 만든다. worker image는 두 container가
공유하고, `migrate`는 PostgreSQL image, `kafka-init`은 Kafka image를 재사용한다.

배포는 다음 명령과 확인 입력을 maintainer가 직접 수행해야 한다.

```bash
./.fordeploy/deploy.sh --deploy aws-demo
```

## 4. AWS 전용 디렉터리

기존 프로젝트 전용 디렉터리 안에서 모든 persistent file과 release metadata를
관리하도록 기본 경로를 정리했다.

```text
/home/ubuntu/semantic-layer-explore/
├── .env.local
├── gcp-key.json
├── data/
└── deploy/
    ├── releases/
    ├── current
    └── previous
```

- `.env.local`: application 설정과 distributed credential
- `gcp-key.json`: 기존 GCP credential file
- `data/`: 기존 SQLite persistent data
- `deploy/`: versioned Compose release와 rollback metadata

## 5. Port Collision 해결

기존 `spring-is-cool`이 host `8080`과 `2222`를 사용하고 있었다.

- Go HTTP host port는 loopback `18080 -> 8080`으로 변경했다.
- frontend와 Go의 Compose 내부 통신은 계속 `http://api:8080`을 사용한다.
- Go SSH 구현은 현재 skeleton이므로 AWS host port mapping을 제거했다.
- 실제 application-controlled SSH server 구현 시 별도 port와 security group을
  다시 설계한다.

frontend는 기존 ALB target port인 `3010 -> 3000`을 유지한다.

## 6. Bind Mount 경로 수정

AWS Compose 파일은 release의 `.fordeploy/`에 있으므로 `./infra/...`는 잘못된
`.fordeploy/infra/...`로 해석됐다. 모든 infrastructure bind mount를
`../infra/...`로 변경했다.

검증한 source path:

- `infra/postgres/migrations`
- `infra/postgres/migrate.sh`
- `infra/kafka/config/topics.sh`
- `infra/mosquitto/config/mosquitto.conf`

## 7. MQTT Exposure 제한

Mosquitto는 아직 anonymous local skeleton 설정이고 Go MQTT subscriber도 실제
구현 전이다. AWS Compose에서 host `1883` port mapping을 제거했다.

현재 AWS 경로는 Compose 내부의 `api -> mosquitto:1883`만 허용한다. 외부 MQTT를
열 때는 다음을 함께 구현해야 한다.

- `allow_anonymous false`
- password file 또는 device identity
- TLS `8883`, 가능하면 mTLS
- 제한된 security-group source
- device별 authorization과 audit

## 8. Infrastructure Credential

별도 `.env.infrastructure`를 만들지 않고 기존 ignored
`/home/ubuntu/semantic-layer-explore/.env.local`에 통합한다.

maintainer가 다음 두 변수를 수동으로 추가했다.

```dotenv
POSTGRES_PASSWORD=<redacted>
NEO4J_PASSWORD=<redacted>
```

실제 값은 repository, release metadata, 문서와 로그에 기록하지 않는다.

배포 스크립트는 다음을 사전 검증한다.

- 두 변수가 존재함
- 각 값이 32자 이상임
- URL-safe 문자 `[A-Za-z0-9_-]`만 사용함

AWS Compose의 기존 고정 password는 제거했다. `.env.local`은 Compose variable
interpolation에 사용하지만 frontend container에는 infrastructure credential을
주입하지 않는다. release의 `.deployment.env`에도 secret 값을 복사하지 않는다.

## 9. Safe Cleanup And Rollback

배포 성공 후 다음 범위만 정리한다.

- Compose project의 완료된 `migrate`, `kafka-init` container
- 현재와 직전 rollback version을 제외한 `physicalai-*` application image tag
- 로컬의 이번 timestamp application image tag
- bastion/private host의 정확한 transfer archive

전역 `docker system prune`, volume prune, 다른 repository image/container 삭제는
수행하지 않는다. PostgreSQL, Kafka, Mosquitto, Neo4j와 SQLite data volume은
보존한다.

## 10. 검증 상태와 다음 단계

실제로 통과한 배포 준비 검증:

- `bash -n .fordeploy/deploy.sh`
- AWS graph-profile Compose config
- production bind mount source path
- host port collision 제거
- Mosquitto host port 미공개
- frontend credential scope 분리
- AWS hardcoded infrastructure credential 제거
- staged diff와 whitespace 검사

아직 수행하지 않은 항목:

- 새 Physical AI image의 최종 수동 AWS 배포
- AWS에서 11개 container 생성 확인
- Kafka와 Neo4j startup 확인
- worker 2개의 partition assignment 확인
- 배포 후 RSS, swap, PSI, I/O 측정
- `t3a.medium` 유지 또는 `t3a.large` 승격 판단

수동 배포 후에는 container별 RSS, host available memory, swap-in/out,
`/proc/pressure/memory`, `/proc/pressure/io`, Kafka consumer lag와 Neo4j heap을
측정한다. 지속 swap, memory PSI 상승, OOM/restart 또는 낮은 available memory가
확인되면 `t3a.large` 이상으로 조정한다.
