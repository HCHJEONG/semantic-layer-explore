# Kubernetes Application Experiment

This directory supports an optional kind exercise. Docker Compose remains the default local and AWS operating model, not merely a legacy fallback.

## Scope

The active exercise moves only the NestJS worker from Compose to kind. Frontend, Go Gateway, PostgreSQL, Kafka, Mosquitto, Neo4j, simulator, and Rust graph worker remain in Compose. The frontend, Go Gateway, Rust worker, Ingress, and Go HPA manifests in this directory are inactive reference drafts and must not be included in the default apply path.

> Scope guard: the current root `kustomization.yaml` still renders the broader reference draft used for API validation. Do not run `kubectl apply -k k8s` until it is revised to the worker-only resource set. The earlier server-side dry-run created no workloads.

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

Render and inspect the active set with:

```bash
kubectl kustomize k8s
kubectl apply --dry-run=server -k k8s
```

The active exercise starts with the Nest worker at replica 1. Apply its HPA only after functional parity is recorded and Metrics Server is available. AWS kind cluster creation remains optional and must not be inferred from the local exercise.

## Probe and shutdown contract

- Frontend: `/api/health` is process liveness; `/api/ready` includes Go Gateway readiness.
- Go Gateway: `/health` is process liveness; `/ready` requires accepting state, an active subscribed MQTT connection, PostgreSQL ping, and Kafka broker connectivity. SIGTERM lowers accepting state before HTTP drain.
- Nest worker: port 8081 `/health` is process liveness; `/ready` becomes true after Kafka connect/subscription/run and false before disconnect and Nest resource cleanup.
- Rust graph worker: port 8081 `/health` is process liveness; `/ready` becomes true after Kafka subscription and false when signal-driven consumption exits. An in-flight projection completes before its synchronous offset commit and shutdown.

Kafka delivery remains at-least-once. The worker commits offsets only after durable processing or durable DLQ publication, and PostgreSQL event/tombstone uniqueness absorbs redelivery. These manifests do not claim Kafka exactly-once processing.
