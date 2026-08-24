#!/usr/bin/env bash
set -euo pipefail

context="${KUBE_CONTEXT:-kind-semantic-layer}"
namespace="${KUBE_NAMESPACE:-semantic-layer}"
worker_container="$(docker compose ps -q worker)"
if [[ -z "$worker_container" ]]; then
  echo "Compose worker must exist so DATABASE_URL can be copied" >&2
  exit 1
fi

database_url="$(docker inspect "$worker_container" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^DATABASE_URL=//p')"
if [[ -z "$database_url" ]]; then
  echo "Compose worker has no DATABASE_URL" >&2
  exit 1
fi

kubectl --context "$context" -n "$namespace" create secret generic semantic-layer-secrets \
  --from-literal="DATABASE_URL=$database_url" \
  --dry-run=client -o yaml | kubectl --context "$context" apply -f -

unset database_url
echo "Prepared semantic-layer-secrets from the running Compose worker"
