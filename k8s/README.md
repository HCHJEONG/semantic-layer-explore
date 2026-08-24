# Kubernetes Application Experiment

This directory supports an optional kind exercise. Docker Compose remains the default local and AWS operating model, not merely a legacy fallback.

## Scope

The active exercise moves only the NestJS worker from Compose to kind. Frontend, Go Gateway, PostgreSQL, Kafka, Mosquitto, Neo4j, simulator, and Rust graph worker remain in Compose. The frontend, Go Gateway, Rust worker, Ingress, and Go HPA manifests in this directory are inactive reference drafts and are excluded from the root `kustomization.yaml`.

The exercise transition is:

```text
normal:   Compose worker running, no kind worker
exercise: Compose worker stopped, kind Nest worker replica 1 or more
rollback: kind Nest worker removed, Compose worker started again
```

Do not leave Compose and kind workers running unintentionally. They use the same Kafka consumer group and would share partitions as one mixed worker pool.

Before the worker-only exercise:

1. prepare only the NestJS worker image with an immutable tag and load it into kind;
2. configure kind-to-Compose Kafka and PostgreSQL connectivity, including Kafka advertised listeners;
3. apply PostgreSQL migrations through `010_postgres_retention.sql` and create all Kafka topics using the existing Compose-era procedures;
4. create `semantic-layer-secrets` through the cluster secret-management path, using `config/secrets.example.yaml` only as a key-name reference;
5. ensure the cluster can pull the images;

Do not apply `secrets.example.yaml`: its name deliberately does not match the Secret referenced by workloads.

## Local exercise

Run from the repository root. The scripts do not expose PostgreSQL or Kafka on host ports. They attach the existing kind node to the Compose network, map the current Compose container IPs behind Kubernetes Services, and copy the running Compose worker's `DATABASE_URL` into a Kubernetes Secret without printing it.

```bash
chmod +x k8s/scripts/*.sh
k8s/scripts/connect-compose-infra.sh
k8s/scripts/prepare-worker-secret.sh

docker build -t physicalai-worker:kind-local worker
kind load docker-image physicalai-worker:kind-local --name semantic-layer

docker compose stop worker
kubectl --context kind-semantic-layer apply -k k8s
kubectl --context kind-semantic-layer rollout status deployment/nest-worker -n semantic-layer --timeout=120s
```

If deployment or verification fails, restore Compose immediately:

```bash
kubectl --context kind-semantic-layer delete deployment nest-worker -n semantic-layer --ignore-not-found
docker compose start worker
```

Normal exercise cleanup uses the same rollback. Deleting the whole kind cluster is optional.

Render and inspect the active set with:

```bash
kubectl kustomize k8s
kubectl apply --dry-run=server -k k8s
```

The active exercise starts with the Nest worker at replica 1. Apply `nest-worker/hpa.yaml` only after functional parity is recorded and Metrics Server is available. AWS kind cluster creation remains optional and must not be inferred from the local exercise.

## Probe and shutdown contract

- Frontend: `/api/health` is process liveness; `/api/ready` includes Go Gateway readiness.
- Go Gateway: `/health` is process liveness; `/ready` requires accepting state, an active subscribed MQTT connection, PostgreSQL ping, and Kafka broker connectivity. SIGTERM lowers accepting state before HTTP drain.
- Nest worker: port 8081 `/health` is process liveness; `/ready` becomes true after Kafka connect/subscription/run and false before disconnect and Nest resource cleanup.
- Rust graph worker: port 8081 `/health` is process liveness; `/ready` becomes true after Kafka subscription and false when signal-driven consumption exits. An in-flight projection completes before its synchronous offset commit and shutdown.

Kafka delivery remains at-least-once. The worker commits offsets only after durable processing or durable DLQ publication, and PostgreSQL event/tombstone uniqueness absorbs redelivery. These manifests do not claim Kafka exactly-once processing.
