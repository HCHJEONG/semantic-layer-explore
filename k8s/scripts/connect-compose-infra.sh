#!/usr/bin/env bash
set -euo pipefail

context="${KUBE_CONTEXT:-kind-semantic-layer}"
namespace="${KUBE_NAMESPACE:-semantic-layer}"
node="${KIND_NODE:-semantic-layer-control-plane}"

kafka_container="$(docker compose ps -q kafka)"
postgres_container="$(docker compose ps -q postgres)"
if [[ -z "$kafka_container" || -z "$postgres_container" ]]; then
  echo "Compose kafka and postgres must be running" >&2
  exit 1
fi

network="$(docker inspect "$kafka_container" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{println}}{{end}}' | head -n1)"
docker network connect "$network" "$node" 2>/dev/null || true
if ! docker network inspect "$network" --format '{{range .Containers}}{{.Name}}{{println}}{{end}}' | grep -Fxq "$node"; then
  echo "Could not attach $node to $network" >&2
  exit 1
fi

kafka_ip="$(docker inspect "$kafka_container" --format "{{with index .NetworkSettings.Networks \"$network\"}}{{.IPAddress}}{{end}}")"
postgres_ip="$(docker inspect "$postgres_container" --format "{{with index .NetworkSettings.Networks \"$network\"}}{{.IPAddress}}{{end}}")"

kubectl --context "$context" apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: $namespace
spec:
  ports:
    - name: kafka
      port: 9092
---
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: kafka-compose
  namespace: $namespace
  labels:
    kubernetes.io/service-name: kafka
addressType: IPv4
ports:
  - name: kafka
    protocol: TCP
    port: 9092
endpoints:
  - addresses: ["$kafka_ip"]
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: $namespace
spec:
  ports:
    - name: postgres
      port: 5432
---
apiVersion: discovery.k8s.io/v1
kind: EndpointSlice
metadata:
  name: postgres-compose
  namespace: $namespace
  labels:
    kubernetes.io/service-name: postgres
addressType: IPv4
ports:
  - name: postgres
    protocol: TCP
    port: 5432
endpoints:
  - addresses: ["$postgres_ip"]
EOF

echo "Connected kind node to $network and mapped Compose kafka/postgres services"
