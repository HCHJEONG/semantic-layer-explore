# Third-Stage Handoff 003: Kubernetes Readiness And Manifests

Date: 2026-08-24

## Scope

Phase 2 runtime preparation and Phase 3 plain manifests are implemented locally. No Kubernetes cluster or AWS deployment was changed. Existing Compose assets remain the verified legacy baseline.

Subsequent scope decision: Docker Compose remains the default operating model on both local WSL and AWS. The active kind path is an optional NestJS worker-only exercise. It does not move frontend, Go Gateway, Rust graph worker, or stateful infrastructure into Kubernetes. Broader manifests produced in this handoff are inactive reference drafts unless the scope is explicitly expanded later.

## Runtime preparation

- Go Gateway readiness now requires MQTT connection plus successful shared-topic subscription, PostgreSQL ping, Kafka broker connectivity, and a non-draining process. SIGTERM marks it not ready before the HTTP server drains; MQTT, outbox, SSH, Kafka writers, and PostgreSQL close through the existing cancellation path.
- Nest worker exposes `/health` and `/ready` on `HEALTH_PORT` (default `8081`). It becomes ready only after Kafka consumer startup and marks itself not ready before consumer disconnect and Nest provider cleanup. Startup retry can be interrupted by SIGTERM.
- Rust graph worker exposes the same probe paths and health port. It marks readiness after Kafka subscription, stops fetching on SIGINT/SIGTERM, completes an already-running projection, commits its offset synchronously, and then exits.
- Frontend retains its existing `/api/health` and dependency-aware `/api/ready` routes. Kubernetes removes terminating Pods from endpoints; Next.js receives the normal SIGTERM with a 30-second grace period.

## Kafka and idempotency boundary

The Kubernetes path preserves at-least-once delivery. It does not claim broker transactions or exactly-once processing.

- Go MQTT ingress acknowledges only after synchronous Kafka publication.
- Go Kafka writers require acknowledgements from all in-sync replicas. Producer retry ambiguity can still duplicate a record, so this is a durability setting rather than an exactly-once claim.
- Nest Kafka consumer uses `autoCommit: false`; durable telemetry/command-result handling or durable DLQ recording precedes offset commit.
- `telemetry_event_dedup` and PostgreSQL uniqueness preserve `eventId` idempotency beyond payload retention.
- Rust graph projection completes before synchronous offset commit; Neo4j remains a rebuildable read model.
- A crash between durable handling and offset commit can redeliver, which is expected and covered by database idempotency.

## Manifest design

`k8s/` contains the active Nest worker material and broader application reference drafts. The root `kustomization.yaml` now contains only the namespace, worker ConfigMap, and Nest worker Deployment. Frontend, Go Gateway, Rust worker, Ingress, and Go HPA resources are excluded.

The local bridge does not publish Compose infrastructure ports. `connect-compose-infra.sh` attaches the kind control-plane container to the existing Compose network and creates selectorless `kafka` and `postgres` Services backed by EndpointSlices for the current Compose container IPs. `prepare-worker-secret.sh` copies `DATABASE_URL` from the running Compose worker into the cluster without printing it. The bridge script must be rerun after Compose containers or their network addresses are recreated.

The first experiment is hybrid: PostgreSQL, Kafka, Mosquitto, and Neo4j stay outside Kubernetes. Placeholder DNS names, immutable application image tags, and the actual Secret must be supplied before server-side dry-run or application. Kafka advertised listeners are a specific connectivity prerequisite.

The Nest HPA is a later optional exercise artifact. It must not be enabled during replica-1 parity verification and requires Metrics Server. Resource values are conservative starting points, not measured production sizing.

## Verification

Passed locally:

```text
root npm test -- --runInBand (Next production build and 6 tests)
cd api && go test -race ./... && go vet ./...
cd worker && npm test
npx --yes yaml-lint "k8s/**/*.yaml" "k8s/*.yaml"
docker compose config --quiet
AWS Compose config with required validation-only environment values
git diff --check
```

The existing local Compose services remained running; no container was replaced or restarted. The earlier Phase 1 two-Gateway test and second-stage two-worker partition-assignment evidence remain the scale baseline, but were not rerun in this manifest-only pass.

Rust compilation could not complete directly in the WSL checkout because existing Cargo build artifacts are root-owned and the alternate temporary filesystem prevents CMake execution. `cargo metadata --no-deps` passed, but that is not a compilation result.

After this handoff, the maintainer installed `kubectl v1.36.4` and `kind v0.32.0` in local WSL and created the `kind-semantic-layer` cluster with Kubernetes v1.36.1. Kustomize rendered 425 lines and all drafted resources passed Kubernetes server-side dry-run after creating the otherwise empty `semantic-layer` namespace. This validates manifest API shape only; no workload was applied and no functional parity claim is made. AWS has the client tools and Docker permission prepared, but no AWS kind cluster has been created.
