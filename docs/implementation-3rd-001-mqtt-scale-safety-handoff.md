# Third-Stage Handoff 001: MQTT Gateway Scale Safety

Date: 2026-08-24

## Scope

This handoff records the Kubernetes preflight work completed before writing Kubernetes manifests:

- runtime-unique MQTT client identity;
- shared telemetry and command-result subscriptions;
- manual MQTT acknowledgement after synchronous Kafka publication;
- leased PostgreSQL ownership for outbound command dispatch and timeout/failure publication;
- an isolated two-Gateway Compose scale test.

No AWS or Kubernetes deployment was performed. Production and `aws-demo` deployment remain maintainer-only operations.

## Runtime identity and subscriptions

`MQTT_CLIENT_ID` is an optional explicit override. Otherwise the Gateway uses `INSTANCE_ID`, falling back to `os.Hostname()`, and creates a portable ID from a short prefix plus the first 12 hexadecimal characters of the instance identity SHA-256 digest.

Kubernetes must inject the Pod UID into `INSTANCE_ID`. Compose intentionally leaves it unset so each container hostname becomes the instance identity. Do not set one shared `INSTANCE_ID` or `MQTT_CLIENT_ID` for multiple replicas.

The active subscriptions are:

```text
$share/physicalai-telemetry/devices/+/telemetry
$share/physicalai-command-results/devices/+/command-results
```

Paho auto-ACK is disabled. Valid telemetry and command results are acknowledged only after synchronous Kafka publication succeeds. Invalid boundary payloads are deliberately rejected and acknowledged so they do not create an infinite MQTT poison-message loop. Kafka publication failure leaves the MQTT message unacknowledged for redelivery.

## Outbound command lease

Migration `009_device_command_dispatch_lease.sql` adds `dispatch_owner` and `lease_until` to `device_command`.

- Ready command claims use `FOR UPDATE SKIP LOCKED` and record the Gateway client ID as owner.
- A `publishing` command whose lease expires can be reclaimed after a Gateway failure.
- Publish success, retry, and exhaustion updates require the same owner.
- ACK timeout and synthetic publish-failure result queries also use leased atomic claims.
- Owner-conditioned updates require exactly one affected row, making lost ownership observable.

Reclaiming an ambiguous MQTT publish can send the same command again. The worker already treats terminal command results idempotently, but the physical actuator must also deduplicate by `commandId`.

## Physical device boundary

The Python simulator currently caches each `commandId` and its result in process memory. A duplicate command in the same process does not mutate state again and returns the cached ACK. This is useful test behavior but is not a production device guarantee because restart clears the cache.

A real device adapter remains pending and must:

1. persist a bounded set of recent `commandId` values and final ACK payloads in durable local storage;
2. avoid repeating physical actuation for a known `commandId`;
3. republish the stored ACK for duplicate delivery;
4. retain this behavior across device reboot and network reconnect.

Until that is implemented and tested, do not claim end-to-end command idempotency for real devices.

## Compose scale-test overlay

`compose.mqtt-scale-test.yaml` removes host port publications for the test project. It does not replace or delete the legacy `compose.yaml` baseline. Tests use a separate Compose project name and separate volumes so the maintainer's running local stack is not modified.

## Verification evidence

The isolated project ran two Go Gateway containers with these distinct identities:

```text
api-1: instanceId=e6a1a0c3af7d clientId=pagobd82a4b306fd
api-2: instanceId=b68d270d14cc clientId=pagobcfbc3583ff4
```

Both joined the configured telemetry and command-result shared groups without reconnect competition.

Twenty uniquely identified MQTT telemetry events were published. Kafka contained exactly 20 matching records, distributed evenly in this run:

```text
Kafka records: 20
api-1 handled: 10
api-2 handled: 10
```

A command was inserted as `publishing` with owner `dead-gateway` and an expired lease. `api-1` reclaimed it, incremented `publish_attempts` from 1 to 2, published it once, received the simulator ACK through the shared command-result subscription, and the worker finalized it:

```text
scale-lease-command-1 | succeeded | publish_attempts=2 | owner cleared | lease cleared
```

Static and unit verification also passed:

```text
go test ./...
go vet ./...
docker compose config --quiet
docker compose -f compose.yaml -f compose.mqtt-scale-test.yaml config --quiet
docker compose -f .fordeploy/compose.aws-demo.yaml config --quiet
python -m unittest telemetry-simulator/test_simulator.py
git diff --check
```

## AWS maintainer configuration

Use `.fordeploy/.env.example` as the template for the private instance's `/home/ubuntu/semantic-layer-explore/.env.local`. It lists every runtime value that AWS Compose allows the maintainer to set in that file and marks required values. Optional entries are populated with the same values as their Compose fallbacks, so they may be kept as-is, changed explicitly, or deleted. Only the two required password placeholders must be replaced before deployment.

The AWS Compose file supplies defaults, so no new MQTT variable is mandatory in `.env.local` for a single Gateway deployment. The available MQTT overrides are:

```text
MQTT_CLIENT_ID_PREFIX=pago
MQTT_TELEMETRY_SHARED_GROUP=physicalai-telemetry
MQTT_COMMAND_RESULT_SHARED_GROUP=physicalai-command-results
MQTT_COMMAND_LEASE_SECONDS=30
```

Do not put one fixed `MQTT_CLIENT_ID` or `INSTANCE_ID` into a shared AWS Compose environment when scaling Gateway replicas. Let each Compose container use its hostname. A deployment must include migration 009 and the updated Compose/application image; adding environment variables alone is not sufficient.

### AWS `.env.local` legacy cleanup

The private instance environment was reviewed against current code and `compose.aws-demo.yaml`.

- Remove `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `PHYSICAL_ADAPTER`, `SIMULATOR_INTERVAL_MS`, and `DATABASE_PATH`. They belong to retired or absent code paths.
- Remove `NODE_ENV`, `PORT`, `INTERNAL_API_ORIGIN`, and `GOOGLE_APPLICATION_CREDENTIALS` from the private `.env.local`. AWS Compose sets them explicitly inside the frontend container; instance-file values do not take effect.
- Keep `SIMULATOR_SEED`, `SIMULATOR_EVENTS_PER_HOUR`, `SIMULATOR_SCENARIO`, `SIMULATOR_DEVICE_ID`, and `SIM_COMMAND_FAILURE_RATE` when manually controlling the active Python MQTT simulator.
- `LLM_PROVIDER`, `ASK_AI_DAILY_LIMIT`, and `EXPLAIN_AI_DAILY_LIMIT` are active application settings. AWS Compose now passes them into the frontend container; earlier instance-file values were ignored.
- `READING_RETENTION_DAYS`, `AUDIT_EVENT_RETENTION_DAYS`, `RETENTION_CLEANUP_INTERVAL_MS`, and `RETENTION_BATCH_SIZE` became active PostgreSQL worker settings in `implementation-3rd-002-postgres-retention-handoff.md`.
