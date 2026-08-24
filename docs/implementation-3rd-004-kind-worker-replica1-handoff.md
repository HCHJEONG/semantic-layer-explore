# Third-Stage Handoff 004: Optional kind Worker Replica 1

Date: 2026-08-24

## Scope

This handoff verifies the optional local exercise in which only the NestJS worker temporarily moves from Docker Compose to kind. Docker Compose remains the default local and AWS operating model. No AWS cluster or deployment was changed.

## Active configuration

The root `k8s/kustomization.yaml` now contains only:

- the `semantic-layer` namespace;
- the Nest worker ConfigMap;
- one Nest worker Deployment.

Frontend, Go Gateway, Rust graph worker, Ingress, and Go HPA manifests remain inactive reference drafts. The Nest HPA is also excluded from the replica-1 path.

`connect-compose-infra.sh` attaches the kind control-plane container to the current Compose network and creates selectorless `kafka` and `postgres` Services plus EndpointSlices. This preserves the broker-advertised `kafka:9092` name without publishing infrastructure ports. Because Compose container IPs can change, rerun the script after containers or the network are recreated.

`prepare-worker-secret.sh` copies `DATABASE_URL` from the running Compose worker into `semantic-layer-secrets` without printing it. Real Secret data is not stored in the repository.

## Verification

The local tools and cluster were:

```text
kubectl v1.36.4
kind v0.32.0
kind-semantic-layer: Kubernetes v1.36.1
```

Verification completed:

1. Worker-only Kustomize passed Kubernetes server-side dry-run.
2. A temporary Pod connected to `kafka.semantic-layer.svc.cluster.local:9092` and `postgres.semantic-layer.svc.cluster.local:5432`.
3. `physicalai-worker:kind-local` built successfully and loaded into the kind node.
4. The Compose worker was stopped before the kind worker started.
5. The kind Deployment reached `1/1 Ready` with zero restarts and received all six `telemetry.raw` and all six `command.result` partitions.
6. Local migration 010 was initially missing; the existing Compose migration runner applied migrations through `010_postgres_retention.sql`. After restart, the kind worker logged a successful bounded retention cleanup with zero eligible rows.
7. Event `kind-parity-20260824-001` followed existing Go HTTP -> Kafka -> kind Nest worker -> PostgreSQL and persisted with topic `telemetry.raw`, partition 1, offset 0.
8. No warning or error appeared in the active Pod during the final parity event.
9. The kind Deployment was deleted, the Compose worker was restarted, and it rejoined the same consumer group with all 12 topic partitions. No kind workloads remain in the namespace.

The initial retention failure was a useful gate failure rather than an accepted warning: replica parity was not considered complete until migration 010 was applied and cleanup succeeded.

## Default state after the exercise

The system is back on its default topology:

```text
Compose frontend, Go Gateway, Kafka, PostgreSQL, Mosquitto, and Nest worker running
kind cluster retained for optional future exercises
no Nest worker Deployment or Pod running in kind
AWS kind cluster not created
```

To repeat the exercise, follow `k8s/README.md`. Always prepare the bridge and Secret while the Compose worker still exists, stop the Compose worker before applying the kind Deployment, and restore Compose after the exercise.
