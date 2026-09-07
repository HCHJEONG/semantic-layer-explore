# Second-Stage Handoff 016: Kafka Health And Persistent Data Recovery

Date: 2026-09-07

## Scope and authorization

The user explicitly authorized this incident's aws-demo configuration update and
Kafka-only recreation, overriding the usual maintainer-only deployment rule for
this operation. The full deployment script was not executed. No images were
built or pulled; no instance, credit mode, topic, or test message was changed.
A subsequent Docker MAC collision required reconnecting the existing graph-worker
network endpoint and starting that same container; details are below. The initial Git worktree was clean.

## Observed incident

- Kafka was running but unhealthy, with 72,276 consecutive failures and the
  latest five checks all exceeding the old 5-second timeout.
- A bounded existing-topic listing succeeded in 16.57 seconds, exit 0.
- Existing MQTT producer and worker accepted-event logs matched each minute.
  PostgreSQL retained matching event IDs and Kafka partition/offset metadata.
- Initial target measurement: 3,868 MiB RAM, 902 MiB available, 1,229 MiB swap
  used. One-second CPU steal samples were 24%, 77%, 78%, and 71%.
- CloudWatch CPUCreditBalance was nearly zero (latest observed approximately
  0.000058 credits). DescribeInstanceCreditSpecifications was denied by IAM,
  so credit mode was not confirmed or changed.
- Recent pre-change Kafka GC evidence showed 826M -> 219M in a 1,024M heap,
  with a 164ms young-GC pause. The broker heap remains -Xms1G -Xmx1G.

The immediate unhealthy classification was a probe timeout, not evidence that
Kafka had stopped processing. CPU contention and nearly exhausted credits are
strong contributors to latency; this investigation does not prove credit mode
or attribute every historical timeout to one cause.

## Configuration change

Both root compose.yaml and .fordeploy/compose.aws-demo.yaml retain the Kafka
topic-list protocol check and now use interval 60s, timeout 30s, start_period
120s, retries 3. Three consecutive failures represent roughly 2-4.5 minutes
from failure onset after startup, depending on probe phase and duration, plus
scheduler delays. This reduces repeated JVM startup overhead while keeping
bounded Kafka-response checks.

AWS Compose also sets KAFKA_LOG_DIRS=/var/lib/kafka/data. Before this change,
the named volume physicalai_kafka-data was mounted there but empty: approximately
104 MiB of actual broker logs and metadata lived in /tmp/kafka-logs in the
container writable layer. A plain recreation would have lost those records.

## Server application and data preservation

The running container's Compose label referenced release aws20260823132547;
deploy/current referenced aws20260824094711. Their effective Kafka service
configurations were compared and were identical before modification. Both
release Compose files received the same Kafka-only patch; unrelated differences
between releases were preserved.

Server backup directory:
 /home/ubuntu/semantic-layer-explore/deploy/kafka-recovery-20260907

It contains both original Compose files, candidate updated files, original
Kafka image/mount/health metadata, container identities, the stopped broker's
kafka-logs directory, and data-sha256.json. No credential/environment files were
copied into the backup or this report.

Kafka was stopped with docker stop --time 60 (exit 143, OOM false). The stopped
container's /tmp/kafka-logs was copied to the backup, then into the existing
physicalai_kafka-data volume. All 629 file hashes matched before recreation.
The existing image ID was preserved:
sha256:b610bd8a193ab94359c15d0419831169d6ef8090ee1ef0cc00e37c5fa87a8061

Only Kafka was recreated with --no-deps --no-build --pull never. Existing named
and anonymous mounts were preserved. The cluster and directory IDs were
unchanged; the new effective log.dirs points to /var/lib/kafka/data.

Initial post-recreation CLI probes timed out during broker recovery (exit 137,
approximately 33 seconds including Docker overhead for a 30-second in-container
timeout). These were startup failures, not successful verification. A later
topic listing succeeded in 16.84 seconds. A consumer-group CLI invocation
reported a TimeoutException despite exit 0; it is not counted as a pass.

The maintenance interruption produced two observed MQTT publish failures at
08:57 and 08:58 UTC (context deadline exceeded). The next event was queued at
08:59:07 and persisted at 08:59:44 after group rejoining. This operation does
not claim lossless ingress during the broker outage.

## Commands executed

Commands were run through WSL and ssh aws-bastion -> ssh aws-demo. Initial
sandbox execution failed at ACL initialization; approved ordinary execution was
then used. WSL rg was unavailable; subsequent searches used grep/find.

Local static validation (all passed):
- git diff --check
- docker compose config --quiet
- PHYSICALAI_VERSION=validation GCP_KEY_ON_PRIVATE=/tmp/validation-key POSTGRES_PASSWORD=validation NEO4J_PASSWORD=validation docker compose -f .fordeploy/compose.aws-demo.yaml --profile graph --profile simulator config --quiet
- bash -n .fordeploy/deploy.sh

Remote diagnostics included hostname, uptime, free -m, df -h /, vmstat 1 5,
CPU/memory/I/O PSI, docker ps -a, selective docker inspect, bounded docker logs,
docker stats --no-stream, GC log tail, and existing telemetry_event SELECTs.

Kafka queries were timed with /usr/bin/time -f 'elapsed=%e exit=%x':
- docker exec physicalai-kafka-1 timeout -s KILL 30 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
- docker exec physicalai-kafka-1 timeout -s KILL 30 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group physicalai-telemetry-workers

The applied Compose invocation used the existing two env files without printing
their contents. With root=/home/ubuntu/semantic-layer-explore and
release=$root/deploy/releases/aws20260824094711:

docker compose --env-file "$root/.env.local" --env-file "$release/.deployment.env" -p physicalai -f "$release/.fordeploy/compose.aws-demo.yaml" --profile graph --profile simulator config --quiet

docker compose --env-file "$root/.env.local" --env-file "$release/.deployment.env" -p physicalai -f "$release/.fordeploy/compose.aws-demo.yaml" --profile graph --profile simulator up -d --no-deps --no-build --pull never kafka

Data migration commands after stopping Kafka:
- docker cp -a physicalai-kafka-1:/tmp/kafka-logs "$backup/kafka-logs"
- docker cp -a "$backup/kafka-logs/." physicalai-kafka-1:/var/lib/kafka/data/
- Python hashlib.sha256 comparison of every file in backup and volume.

No application code/UI changed; application builds and tests were not run.

## Rollback

For a healthcheck rollback, restore only the previous test/timing values in both
release files and source Compose, while retaining KAFKA_LOG_DIRS and the populated
volume, validate config, and repeat the Kafka-only up command above. This
preserves all records accepted after migration.

Do not blindly restore the entire old Compose: it omitted KAFKA_LOG_DIRS and
would switch the recreated broker back to an empty container-local directory.
The stopped-data backup is an incident recovery snapshot, not a normal rollback:
restoring it after new traffic would discard later Kafka records and requires
a separate, deliberate data recovery decision.

The local patch must be committed and merged through the maintainer's normal
workflow before the clean origin/main deployment clone includes it. Server
configuration is applied, but an older source revision remains unsafe to deploy.

## Follow-up Docker network repair

After Kafka recreation, graph-worker repeatedly failed with No route to host.
Inspection showed both Kafka (IP 172.19.0.7) and graph-worker (IP 172.19.0.5)
using MAC 02:42:ac:13:00:07. Graph-worker's ARP entry for Kafka was unresolved.
The observed address collision explains this follow-up transport failure;
the Docker allocation/restart mechanism that caused it was not proven.

The graph-worker container identity, image, and network metadata were backed up
to graph-network.before.txt. Its existing endpoint was disconnected and
reconnected with the same Compose service aliases; no container was recreated:
- docker stop --time 20 physicalai-graph-worker-1
- docker network disconnect physicalai_default physicalai-graph-worker-1
- docker network connect --alias graph-worker --alias physicalai-graph-worker-1 physicalai_default physicalai-graph-worker-1
- docker start physicalai-graph-worker-1

Graph-worker then received MAC 02:42:ac:13:00:05 at the same IP. Kafka kept its
existing endpoint. No fixed IP/MAC workaround was added to source configuration.
The original problem was runtime endpoint state, not a missing source setting.

## Final verification

- Five consecutive successful Docker probes completed from 09:00:51 through
  09:05:12 UTC, with durations approximately 21.83, 2.88, 12.72, 2.89, 2.83 seconds.
  Status healthy; failing streak 0. One earlier startup timeout was observed.
- Post-start topic queries returned all eight existing topics, exit 0, in
  16.84 and 18.08 seconds.
- Consumer group query with --timeout 25000 succeeded in 3.66 seconds.
  Workers retained IDs dfd20e539985 and ba73772a2686; each owned three partitions
  of telemetry.raw and command.result. Every partition with existing records
  had lag 0; empty partitions had log-end 0 and no committed offset.
- Graph group query with --state --timeout 25000 succeeded in 7.79 seconds:
  physicalai-graph-projectors, Stable, one member. No synthetic rebuild was sent.
- Existing MQTT event 354dc01e-dd9e-4c13-8f86-31cc03c5d5fe was queued at
  09:03:06.424 and persisted at 09:03:06.510, telemetry.raw partition 1,
  offset 21042. Earlier stored offsets survived migration. API /ready passed.
- Final resource sample: available RAM 1,932 MiB (initial 902), swap used 554 MiB
  (initial 1,229), one-second CPU steal 0-1% (initial 24-78%). These are short
  samples after restart, not sustained capacity guarantees; the heap is unchanged.
- The five user-stopped containers remained stopped. Other container identities
  were preserved, except the deliberately recreated Kafka container.
- No topic/message deletion, volume deletion, broad prune, full-stack deployment,
  application image build, AWS capacity change, or credential modification ran.

Remaining limits: CPU credits were nearly exhausted before the change and their
long-term recovery is unverified. Broker maintenance caused the two documented
MQTT publish failures; this investigation did not replay or fabricate them.
Future deployment must include this source patch through the normal clean-clone
workflow. Do not deploy a historical Compose without the corrected data path.

