# Kubernetes Application Experiment

This directory is the active third-stage Kubernetes path. The root Compose files remain the legacy integration and AWS rollback baseline and are not replaced by these manifests.

## Scope

The manifests run only the four application workloads: frontend, Go Gateway, Nest worker, and Rust graph worker. PostgreSQL, Kafka, Mosquitto, and Neo4j remain external for the first hybrid experiment. Their DNS names must be reachable from Pods, and broker-advertised Kafka addresses must also be resolvable from Pods.

Before applying:

1. publish the four application images with one immutable tag and replace every `REPLACE_ME` image tag;
2. replace every `*.semantic-infra.example` endpoint in `config/configmap.yaml`;
3. apply PostgreSQL migrations through `010_postgres_retention.sql` and create all Kafka topics using the existing Compose-era procedures;
4. create `semantic-layer-secrets` through the cluster secret-management path, using `config/secrets.example.yaml` only as a key-name reference;
5. ensure the cluster can pull the images;
6. replace or omit the example Ingress host and configure the cluster's Ingress controller/TLS separately.

Do not apply `secrets.example.yaml`: its name deliberately does not match the Secret referenced by workloads.

Render and inspect the active set with:

```bash
kubectl kustomize k8s
kubectl apply --dry-run=server -k k8s
```

Phase 4 starts with all Deployments at replica 1. The two HPA manifests are deliberately excluded from `kustomization.yaml`; apply them only after replica-1 functional parity is recorded and Metrics Server is available.

## Probe and shutdown contract

- Frontend: `/api/health` is process liveness; `/api/ready` includes Go Gateway readiness.
- Go Gateway: `/health` is process liveness; `/ready` requires accepting state, an active subscribed MQTT connection, PostgreSQL ping, and Kafka broker connectivity. SIGTERM lowers accepting state before HTTP drain.
- Nest worker: port 8081 `/health` is process liveness; `/ready` becomes true after Kafka connect/subscription/run and false before disconnect and Nest resource cleanup.
- Rust graph worker: port 8081 `/health` is process liveness; `/ready` becomes true after Kafka subscription and false when signal-driven consumption exits. An in-flight projection completes before its synchronous offset commit and shutdown.

Kafka delivery remains at-least-once. The worker commits offsets only after durable processing or durable DLQ publication, and PostgreSQL event/tombstone uniqueness absorbs redelivery. These manifests do not claim Kafka exactly-once processing.
