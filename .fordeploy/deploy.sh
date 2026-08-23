#!/usr/bin/env bash
set -euo pipefail

# This deployment is intentionally maintainer-operated. Agents may edit and
# statically validate this file, but must never execute it against AWS.
if [ "$#" -ne 0 ]; then
  echo "Usage: .fordeploy/deploy.sh" >&2
  exit 2
fi

# Freeze the script before the long build and transfer. This prevents an editor
# or concurrent commit from changing the file offsets while Bash is still
# reading the running script.
if [ "${DEPLOY_SCRIPT_SNAPSHOT:-0}" != "1" ]; then
  SOURCE_SCRIPT="$(realpath -- "${BASH_SOURCE[0]}")"
  SOURCE_WORKING_ROOT="$(cd -- "$(dirname -- "${SOURCE_SCRIPT}")/.." && pwd)"
  SNAPSHOT_PATH="$(mktemp "${TMPDIR:-/tmp}/physicalai-deploy-script.XXXXXX.sh")"
  cp -- "${SOURCE_SCRIPT}" "${SNAPSHOT_PATH}"
  chmod 700 "${SNAPSHOT_PATH}"
  exec env \
    DEPLOY_SCRIPT_SNAPSHOT=1 \
    DEPLOY_SCRIPT_SNAPSHOT_PATH="${SNAPSHOT_PATH}" \
    DEPLOY_WORKING_ROOT="${SOURCE_WORKING_ROOT}" \
    "${SNAPSHOT_PATH}" "$@"
fi

VERSION="${VERSION:-aws$(date +'%Y%m%d%H%M%S')}"
PROJECT_NAME="${PROJECT_NAME:-physicalai}"
WORKER_SCALE="${WORKER_SCALE:-2}"
BASTION_HOST="${BASTION_HOST:-aws-bastion}"
PRIVATE_HOST="${PRIVATE_HOST:-aws-demo}"
REMOTE_TRANSFER_DIR="${REMOTE_TRANSFER_DIR:-/home/ubuntu}"
APP_DIR_ON_PRIVATE="${APP_DIR_ON_PRIVATE:-/home/ubuntu/semantic-layer-explore}"
DEPLOY_ROOT="${DEPLOY_ROOT:-${APP_DIR_ON_PRIVATE}/deploy}"
ENV_FILE_ON_PRIVATE="${ENV_FILE_ON_PRIVATE:-${APP_DIR_ON_PRIVATE}/.env.local}"
GCP_KEY_ON_PRIVATE="${GCP_KEY_ON_PRIVATE:-${APP_DIR_ON_PRIVATE}/gcp-key.json}"
FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT:-3010}"
API_HTTP_HOST_PORT="${API_HTTP_HOST_PORT:-18080}"
PUBLIC_URL="${PUBLIC_URL:-https://physicalai.penvot.com}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKING_ROOT="${DEPLOY_WORKING_ROOT:?missing DEPLOY_WORKING_ROOT}"
REPO_URL="${REPO_URL:-git@github.com:HCHJEONG/semantic-layer-explore.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
CLEAN_CLONE_ROOT="${CLEAN_CLONE_ROOT:-${HOME}/deploy-remote-repo}"
CLEAN_CLONE_DIR="${CLEAN_CLONE_DIR:-${CLEAN_CLONE_ROOT}/semantic-layer-explore}"
GIT_SSH_KEY="${GIT_SSH_KEY:-${HOME}/.ssh/id_rsa}"
STARTED_SSH_AGENT=0
ARTIFACT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/physicalai-deploy.XXXXXX")"
IMAGE_ARCHIVE="${ARTIFACT_DIR}/physicalai-images-${VERSION}.tar.gz"
BUNDLE_ARCHIVE="${ARTIFACT_DIR}/physicalai-compose-${VERSION}.tar.gz"
IMAGE_ARCHIVE_NAME="$(basename "${IMAGE_ARCHIVE}")"
BUNDLE_ARCHIVE_NAME="$(basename "${BUNDLE_ARCHIVE}")"

APPLICATION_IMAGES=(
  "physicalai-web:${VERSION}"
  "physicalai-api:${VERSION}"
  "physicalai-worker:${VERSION}"
  "physicalai-graph-worker:${VERSION}"
  "physicalai-telemetry-simulator:${VERSION}"
)
INFRASTRUCTURE_IMAGES=(
  "postgres:16-alpine"
  "apache/kafka:3.8.0"
  "eclipse-mosquitto:2"
  "neo4j:5-community"
)

cleanup_local() {
  rm -rf -- "${ARTIFACT_DIR}"
  rm -f -- "${DEPLOY_SCRIPT_SNAPSHOT_PATH:-}"
  for image in "${APPLICATION_IMAGES[@]}"; do
    docker image rm "${image}" >/dev/null 2>&1 || true
  done
  if [ "${STARTED_SSH_AGENT}" = "1" ]; then
    ssh-agent -k >/dev/null 2>&1 || true
  fi
}
trap cleanup_local EXIT

for command_name in awk docker git grep ssh scp ssh-agent ssh-add ssh-keygen tar gzip realpath; do
  command -v "${command_name}" >/dev/null || { echo "Missing command: ${command_name}" >&2; exit 1; }
done
docker compose version >/dev/null
test -f "${GIT_SSH_KEY}" || { echo "Missing Git SSH key: ${GIT_SSH_KEY}" >&2; exit 1; }

if ! ssh-add -l >/dev/null 2>&1; then
  eval "$(ssh-agent -s)" >/dev/null
  STARTED_SSH_AGENT=1
fi
add_key_if_missing() {
  local key_path="$1"
  local key_label="$2"
  local fingerprint
  fingerprint="$(ssh-keygen -lf "${key_path}" | awk '{print $2}')"
  if ssh-add -l | grep -Fq "${fingerprint}"; then
    echo "[local] ${key_label} SSH key is already loaded in ssh-agent"
    return
  fi
  echo "[local] adding ${key_label} SSH key to ssh-agent (passphrase may be requested once)"
  ssh-add "${key_path}"
}

add_key_if_missing "${GIT_SSH_KEY}" "GitHub"

case "$(realpath -m "${CLEAN_CLONE_ROOT}")" in
  "${HOME}/deploy-remote-repo") ;;
  *) echo "Unsafe CLEAN_CLONE_ROOT: ${CLEAN_CLONE_ROOT}" >&2; exit 1 ;;
esac
case "$(realpath -m "${CLEAN_CLONE_DIR}")" in
  "${HOME}/deploy-remote-repo/semantic-layer-explore") ;;
  *) echo "Unsafe CLEAN_CLONE_DIR: ${CLEAN_CLONE_DIR}" >&2; exit 1 ;;
esac
[ "$(realpath -m "${CLEAN_CLONE_DIR}")" != "${WORKING_ROOT}" ] || {
  echo "Clean clone must not be the working checkout" >&2
  exit 1
}

if [ -n "$(git -C "${WORKING_ROOT}" status --porcelain)" ]; then
  echo "Working checkout has uncommitted changes; commit and push before deployment" >&2
  exit 1
fi
git -C "${WORKING_ROOT}" fetch --prune origin \
  "+refs/heads/${DEPLOY_BRANCH}:refs/remotes/origin/${DEPLOY_BRANCH}"
WORKING_HEAD="$(git -C "${WORKING_ROOT}" rev-parse HEAD)"
UPSTREAM_HEAD="$(git -C "${WORKING_ROOT}" rev-parse "origin/${DEPLOY_BRANCH}")"
[ "${WORKING_HEAD}" = "${UPSTREAM_HEAD}" ] || {
  echo "Working HEAD does not match origin/${DEPLOY_BRANCH}; push or update before deployment" >&2
  exit 1
}

mkdir -p "${CLEAN_CLONE_ROOT}"
if [ ! -d "${CLEAN_CLONE_DIR}/.git" ]; then
  [ ! -e "${CLEAN_CLONE_DIR}" ] || {
    echo "Clean clone path exists but is not a Git repository: ${CLEAN_CLONE_DIR}" >&2
    exit 1
  }
  git clone --branch "${DEPLOY_BRANCH}" --single-branch "${REPO_URL}" "${CLEAN_CLONE_DIR}"
fi
[ "$(git -C "${CLEAN_CLONE_DIR}" remote get-url origin)" = "${REPO_URL}" ] || {
  echo "Clean clone origin does not match ${REPO_URL}" >&2
  exit 1
}
git -C "${CLEAN_CLONE_DIR}" fetch --prune origin \
  "+refs/heads/${DEPLOY_BRANCH}:refs/remotes/origin/${DEPLOY_BRANCH}"
git -C "${CLEAN_CLONE_DIR}" checkout -B "${DEPLOY_BRANCH}" "origin/${DEPLOY_BRANCH}"
git -C "${CLEAN_CLONE_DIR}" reset --hard "origin/${DEPLOY_BRANCH}"
git -C "${CLEAN_CLONE_DIR}" clean -fdx

BUILD_COMMIT="$(git -C "${CLEAN_CLONE_DIR}" rev-parse HEAD)"
[ "${BUILD_COMMIT}" = "${UPSTREAM_HEAD}" ] || {
  echo "Clean clone commit does not match origin/${DEPLOY_BRANCH}" >&2
  exit 1
}
echo "[local] building from clean clone ${CLEAN_CLONE_DIR} at ${BUILD_COMMIT}"

export PHYSICALAI_VERSION="${VERSION}"
export DOCKER_DEFAULT_PLATFORM="linux/amd64"

echo "[local] building 5 application images for linux/amd64"
docker compose -f "${CLEAN_CLONE_DIR}/compose.yaml" --profile graph --profile simulator build \
  frontend api worker graph-worker telemetry-simulator

echo "[local] pulling 4 official infrastructure images for linux/amd64"
for image in "${INFRASTRUCTURE_IMAGES[@]}"; do
  docker pull --platform linux/amd64 "${image}"
done

ALL_IMAGES=("${APPLICATION_IMAGES[@]}" "${INFRASTRUCTURE_IMAGES[@]}")
docker image inspect "${ALL_IMAGES[@]}" >/dev/null
echo "[local] saving 9 unique images used by 12 Compose containers"
docker save "${ALL_IMAGES[@]}" | gzip -1 >"${IMAGE_ARCHIVE}"

tar -C "${CLEAN_CLONE_DIR}" -czf "${BUNDLE_ARCHIVE}" \
  .fordeploy/compose.aws-demo.yaml \
  infra/postgres/migrations \
  infra/postgres/migrate.sh \
  infra/kafka/config/topics.sh \
  infra/mosquitto/config/mosquitto.conf

echo "[local] transferring archives to ${BASTION_HOST}"
scp "${IMAGE_ARCHIVE}" "${BUNDLE_ARCHIVE}" "${BASTION_HOST}:${REMOTE_TRANSFER_DIR}/"

ssh "${BASTION_HOST}" \
  PRIVATE_HOST="${PRIVATE_HOST}" REMOTE_TRANSFER_DIR="${REMOTE_TRANSFER_DIR}" \
  IMAGE_ARCHIVE_NAME="${IMAGE_ARCHIVE_NAME}" BUNDLE_ARCHIVE_NAME="${BUNDLE_ARCHIVE_NAME}" \
  VERSION="${VERSION}" PROJECT_NAME="${PROJECT_NAME}" WORKER_SCALE="${WORKER_SCALE}" \
  DEPLOY_ROOT="${DEPLOY_ROOT}" ENV_FILE_ON_PRIVATE="${ENV_FILE_ON_PRIVATE}" \
  GCP_KEY_ON_PRIVATE="${GCP_KEY_ON_PRIVATE}" \
  FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT}" API_HTTP_HOST_PORT="${API_HTTP_HOST_PORT}" \
  PUBLIC_URL="${PUBLIC_URL}" bash -s <<'BASTION'
set -euo pipefail
cleanup_bastion_transfer() {
  rm -f "${REMOTE_TRANSFER_DIR}/${IMAGE_ARCHIVE_NAME}" "${REMOTE_TRANSFER_DIR}/${BUNDLE_ARCHIVE_NAME}"
}
trap cleanup_bastion_transfer EXIT
scp "${REMOTE_TRANSFER_DIR}/${IMAGE_ARCHIVE_NAME}" \
  "${REMOTE_TRANSFER_DIR}/${BUNDLE_ARCHIVE_NAME}" \
  "${PRIVATE_HOST}:${REMOTE_TRANSFER_DIR}/"

ssh "${PRIVATE_HOST}" \
  REMOTE_TRANSFER_DIR="${REMOTE_TRANSFER_DIR}" IMAGE_ARCHIVE_NAME="${IMAGE_ARCHIVE_NAME}" \
  BUNDLE_ARCHIVE_NAME="${BUNDLE_ARCHIVE_NAME}" VERSION="${VERSION}" \
  PROJECT_NAME="${PROJECT_NAME}" WORKER_SCALE="${WORKER_SCALE}" DEPLOY_ROOT="${DEPLOY_ROOT}" \
  ENV_FILE_ON_PRIVATE="${ENV_FILE_ON_PRIVATE}" GCP_KEY_ON_PRIVATE="${GCP_KEY_ON_PRIVATE}" \
  FRONTEND_HOST_PORT="${FRONTEND_HOST_PORT}" \
  API_HTTP_HOST_PORT="${API_HTTP_HOST_PORT}" PUBLIC_URL="${PUBLIC_URL}" bash -s <<'PRIVATE'
set -euo pipefail

cleanup_private_transfer() {
  rm -f "${REMOTE_TRANSFER_DIR}/${IMAGE_ARCHIVE_NAME}" "${REMOTE_TRANSFER_DIR}/${BUNDLE_ARCHIVE_NAME}"
}
trap cleanup_private_transfer EXIT

case "${DEPLOY_ROOT}" in
  /home/ubuntu/*) ;;
  *) echo "Unsafe DEPLOY_ROOT: ${DEPLOY_ROOT}" >&2; exit 1 ;;
esac

test "$(uname -m)" = "x86_64" || { echo "aws-demo must be x86_64" >&2; exit 1; }
test -f "${ENV_FILE_ON_PRIVATE}" || { echo "Missing env file: ${ENV_FILE_ON_PRIVATE}" >&2; exit 1; }
test -f "${GCP_KEY_ON_PRIVATE}" || { echo "Missing GCP key: ${GCP_KEY_ON_PRIVATE}" >&2; exit 1; }
grep -Eq '^POSTGRES_PASSWORD=[A-Za-z0-9_-]{32,}$' "${ENV_FILE_ON_PRIVATE}" || {
  echo "POSTGRES_PASSWORD must be a 32+ character URL-safe value in ${ENV_FILE_ON_PRIVATE}" >&2
  exit 1
}
grep -Eq '^NEO4J_PASSWORD=[A-Za-z0-9_-]{32,}$' "${ENV_FILE_ON_PRIVATE}" || {
  echo "NEO4J_PASSWORD must be a 32+ character URL-safe value in ${ENV_FILE_ON_PRIVATE}" >&2
  exit 1
}
command -v docker >/dev/null || { echo "Docker is not installed" >&2; exit 1; }
sudo docker compose version >/dev/null

RELEASE_DIR="${DEPLOY_ROOT}/releases/${VERSION}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
PREVIOUS_LINK="${DEPLOY_ROOT}/previous"
PREVIOUS_RELEASE="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
case "${PREVIOUS_RELEASE}" in
  ""|"${DEPLOY_ROOT}/releases/"*) ;;
  *) echo "Unsafe previous release path: ${PREVIOUS_RELEASE}" >&2; exit 1 ;;
esac

install -d "${DEPLOY_ROOT}/releases" "${RELEASE_DIR}"
tar -xzf "${REMOTE_TRANSFER_DIR}/${BUNDLE_ARCHIVE_NAME}" -C "${RELEASE_DIR}"
gzip -dc "${REMOTE_TRANSFER_DIR}/${IMAGE_ARCHIVE_NAME}" | sudo docker load

cat >"${RELEASE_DIR}/.deployment.env" <<EOF
PHYSICALAI_VERSION=${VERSION}
ENV_FILE_ON_PRIVATE=${ENV_FILE_ON_PRIVATE}
GCP_KEY_ON_PRIVATE=${GCP_KEY_ON_PRIVATE}
FRONTEND_HOST_PORT=${FRONTEND_HOST_PORT}
API_HTTP_HOST_PORT=${API_HTTP_HOST_PORT}
EOF

COMPOSE_FILE="${RELEASE_DIR}/.fordeploy/compose.aws-demo.yaml"
COMPOSE=(sudo docker compose --env-file "${ENV_FILE_ON_PRIVATE}" --env-file "${RELEASE_DIR}/.deployment.env" -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" --profile graph --profile simulator)
"${COMPOSE[@]}" config --quiet

# Stop the legacy single-container deployment only after all images and config
# have been validated. It owns the same ALB target port.
LEGACY_CONTAINER="ai-physical-workspace"
LEGACY_WAS_RUNNING=0
if sudo docker ps --format '{{.Names}}' | grep -Fxq "${LEGACY_CONTAINER}"; then
  LEGACY_WAS_RUNNING=1
  sudo docker stop "${LEGACY_CONTAINER}"
fi

rollback() {
  echo "[private] deployment failed; attempting rollback" >&2
  if [ -n "${PREVIOUS_RELEASE}" ] && [ -f "${PREVIOUS_RELEASE}/.deployment.env" ]; then
    previous_compose="${PREVIOUS_RELEASE}/.fordeploy/compose.aws-demo.yaml"
    sudo docker compose --env-file "${ENV_FILE_ON_PRIVATE}" --env-file "${PREVIOUS_RELEASE}/.deployment.env" \
      -p "${PROJECT_NAME}" -f "${previous_compose}" --profile graph \
      up -d --no-build --scale "worker=${WORKER_SCALE}" --remove-orphans || true
  elif [ "${LEGACY_WAS_RUNNING}" = "1" ]; then
    "${COMPOSE[@]}" down --remove-orphans || true
    sudo docker start "${LEGACY_CONTAINER}" >/dev/null || true
  fi
  for repository in physicalai-web physicalai-api physicalai-worker physicalai-graph-worker physicalai-telemetry-simulator; do
    sudo docker image rm "${repository}:${VERSION}" >/dev/null 2>&1 || true
  done
}
trap rollback ERR

"${COMPOSE[@]}" up -d --no-build --scale "worker=${WORKER_SCALE}" --remove-orphans

ready=0
for attempt in $(seq 1 60); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${FRONTEND_HOST_PORT}/api/ready" >/dev/null && \
     curl -fsS --max-time 5 "http://127.0.0.1:${API_HTTP_HOST_PORT}/ready" >/dev/null; then
    ready=1
    break
  fi
  echo "[private] waiting for frontend and API readiness (${attempt}/60)"
  sleep 2
done
if [ "${ready}" -ne 1 ]; then
  "${COMPOSE[@]}" ps
  "${COMPOSE[@]}" logs --tail 200 frontend api worker
  exit 1
fi

public_ready=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 10 "${PUBLIC_URL}/api/ready" >/dev/null; then
    public_ready=1
    break
  fi
  echo "[private] waiting for ALB/TLS route (${attempt}/30)"
  sleep 2
done
[ "${public_ready}" -eq 1 ] || { echo "Public URL health check failed: ${PUBLIC_URL}" >&2; exit 1; }

trap - ERR
if [ -n "${PREVIOUS_RELEASE}" ]; then ln -sfn "${PREVIOUS_RELEASE}" "${PREVIOUS_LINK}"; fi
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
sudo docker rm "${LEGACY_CONTAINER}" >/dev/null 2>&1 || true

# Safe cleanup: only this Compose project's completed one-shot containers and
# exact physicalai application repositories are considered. Keep current and
# one previous version for rollback. Never use global prune commands here.
"${COMPOSE[@]}" rm -f migrate kafka-init >/dev/null 2>&1 || true
PREVIOUS_VERSION=""
if [ -n "${PREVIOUS_RELEASE}" ] && [ -f "${PREVIOUS_RELEASE}/.deployment.env" ]; then
  PREVIOUS_VERSION="$(sed -n 's/^PHYSICALAI_VERSION=//p' "${PREVIOUS_RELEASE}/.deployment.env" | head -n 1)"
fi
for repository in physicalai-web physicalai-api physicalai-worker physicalai-graph-worker physicalai-telemetry-simulator; do
  while IFS= read -r image_ref; do
    [ -n "${image_ref}" ] || continue
    [ "${image_ref}" = "${repository}:${VERSION}" ] && continue
    [ -n "${PREVIOUS_VERSION}" ] && [ "${image_ref}" = "${repository}:${PREVIOUS_VERSION}" ] && continue
    sudo docker image rm "${image_ref}" >/dev/null 2>&1 || true
  done < <(sudo docker image ls "${repository}" --format '{{.Repository}}:{{.Tag}}')
done

"${COMPOSE[@]}" ps
echo "[private] deployment healthy: ${PUBLIC_URL}"
PRIVATE
BASTION

echo "DEPLOY SUCCESS: ${VERSION}"
echo "Public URL: ${PUBLIC_URL}"

# Legacy first-stage deployment retained verbatim as an inert reference. It
# sent source code to EC2, built one Next.js image remotely, and ran one
# container. The active deployment above supersedes it because the second-stage
# plan requires local linux/amd64 image builds and a Compose stack.
: <<'LEGACY_DEPLOY_REFERENCE'
#!/usr/bin/env bash
set -euo pipefail

IMAGE_REPOSITORY="ai-physical-workspace"
IMAGE_TAG="${IMAGE_REPOSITORY}:aws$(date +'%Y%m%d%H%M%S')"
CONTAINER_NAME="ai-physical-workspace"
HOST_PORT="3010"
CONTAINER_PORT="3000"
BASTION_HOST="${BASTION_HOST:-ubuntu@43.202.136.180}"
PRIVATE_HOST="${PRIVATE_HOST:-ubuntu@172.31.76.194}"
LOCAL_SSH_KEY="${LOCAL_SSH_KEY:-$HOME/.ssh/penvotkeypair1.pem}"
BASTION_SSH_KEY="${BASTION_SSH_KEY:-/home/ubuntu/.ssh/penvotkeypair1.pem}"
REMOTE_DIR="/home/ubuntu"
APP_DIR="/home/ubuntu/semantic-layer-explore"
DATA_DIR="${APP_DIR}/data"
ENV_FILE="${APP_DIR}/.env.local"
GCP_KEY="${APP_DIR}/gcp-key.json"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ARCHIVE_PATH="$(mktemp "${TMPDIR:-/tmp}/ai-workspace-source.XXXXXX.tar.gz")"
ARCHIVE_NAME="$(basename "${ARCHIVE_PATH}")"

cleanup() { rm -f "${ARCHIVE_PATH}"; }
trap cleanup EXIT
test -f "${LOCAL_SSH_KEY}" || { echo "Missing local SSH key: ${LOCAL_SSH_KEY}"; exit 1; }
tar --exclude=.git --exclude=node_modules --exclude=.next --exclude=data -C "${ROOT_DIR}" -czf "${ARCHIVE_PATH}" .
scp -o StrictHostKeyChecking=accept-new -i "${LOCAL_SSH_KEY}" "${ARCHIVE_PATH}" "${BASTION_HOST}:${REMOTE_DIR}/${ARCHIVE_NAME}"

ssh -o StrictHostKeyChecking=accept-new -i "${LOCAL_SSH_KEY}" "${BASTION_HOST}" \
  PRIVATE_HOST="${PRIVATE_HOST}" BASTION_SSH_KEY="${BASTION_SSH_KEY}" REMOTE_DIR="${REMOTE_DIR}" \
  ARCHIVE_NAME="${ARCHIVE_NAME}" IMAGE_REPOSITORY="${IMAGE_REPOSITORY}" IMAGE_TAG="${IMAGE_TAG}" CONTAINER_NAME="${CONTAINER_NAME}" \
  HOST_PORT="${HOST_PORT}" CONTAINER_PORT="${CONTAINER_PORT}" APP_DIR="${APP_DIR}" DATA_DIR="${DATA_DIR}" ENV_FILE="${ENV_FILE}" GCP_KEY="${GCP_KEY}" bash -s <<'BASTION'
set -euo pipefail
test -f "${BASTION_SSH_KEY}" || { echo "Missing bastion SSH key: ${BASTION_SSH_KEY}"; exit 1; }
scp -o StrictHostKeyChecking=accept-new -i "${BASTION_SSH_KEY}" "${REMOTE_DIR}/${ARCHIVE_NAME}" "${PRIVATE_HOST}:${REMOTE_DIR}/${ARCHIVE_NAME}"
ssh -o StrictHostKeyChecking=accept-new -i "${BASTION_SSH_KEY}" "${PRIVATE_HOST}" \
  REMOTE_DIR="${REMOTE_DIR}" ARCHIVE_NAME="${ARCHIVE_NAME}" IMAGE_REPOSITORY="${IMAGE_REPOSITORY}" IMAGE_TAG="${IMAGE_TAG}" \
  CONTAINER_NAME="${CONTAINER_NAME}" HOST_PORT="${HOST_PORT}" CONTAINER_PORT="${CONTAINER_PORT}" \
  APP_DIR="${APP_DIR}" DATA_DIR="${DATA_DIR}" ENV_FILE="${ENV_FILE}" GCP_KEY="${GCP_KEY}" bash -s <<'PRIVATE'
set -euo pipefail
BUILD_DIR="$(mktemp -d /home/ubuntu/ai-workspace-build.XXXXXX)"
cleanup_private() { sudo rm -rf -- "${BUILD_DIR}"; }
trap cleanup_private EXIT

test -d "${APP_DIR}" || { echo "Missing app dir: ${APP_DIR}"; exit 1; }
test -f "${ENV_FILE}" || { echo "Missing env file: ${ENV_FILE}"; exit 1; }
test -f "${GCP_KEY}" || { echo "Missing GCP key: ${GCP_KEY}"; exit 1; }
tar -xzf "${REMOTE_DIR}/${ARCHIVE_NAME}" -C "${BUILD_DIR}"
sudo docker build -f "${BUILD_DIR}/.fordeploy/ai-workspace-aws/Dockerfile" -t "${IMAGE_TAG}" "${BUILD_DIR}"
sudo install -d -o 1001 -g 1001 "${DATA_DIR}"
sudo docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
sudo docker run -d --restart unless-stopped \
  --name "${CONTAINER_NAME}" -p "${HOST_PORT}:${CONTAINER_PORT}" \
  --env-file "${ENV_FILE}" \
  -v "${DATA_DIR}:/app/data" -v "${GCP_KEY}:/app/gcp-key.json:ro" "${IMAGE_TAG}"

for attempt in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:${HOST_PORT}/api/ready" >/dev/null; then break; fi
  if [ "${attempt}" -eq 30 ]; then sudo docker logs --tail 200 "${CONTAINER_NAME}"; exit 1; fi
  sleep 2
done

CURRENT_CONTAINER_ID="$(sudo docker inspect --format '{{.Id}}' "${CONTAINER_NAME}")"
CURRENT_IMAGE_ID="$(sudo docker inspect --format '{{.Image}}' "${CONTAINER_NAME}")"

while IFS=$'\t' read -r candidate_id candidate_image; do
  [ -n "${candidate_id}" ] || continue
  [ "${candidate_id}" != "${CURRENT_CONTAINER_ID}" ] || continue
  case "${candidate_image}" in
    "${IMAGE_REPOSITORY}:"*) sudo docker rm -f "${candidate_id}" ;;
  esac
done < <(sudo docker ps -a --no-trunc \
  --filter status=created --filter status=exited --filter status=dead \
  --format '{{.ID}}\t{{.Image}}')

while IFS=$'\t' read -r candidate_repository candidate_tag; do
  [ "${candidate_repository}" = "${IMAGE_REPOSITORY}" ] || continue
  [ "${candidate_tag}" != "<none>" ] || continue
  candidate_ref="${candidate_repository}:${candidate_tag}"
  candidate_image_id="$(sudo docker image inspect --format '{{.Id}}' "${candidate_ref}")"
  [ "${candidate_image_id}" != "${CURRENT_IMAGE_ID}" ] || continue
  sudo docker image rm "${candidate_ref}" || true
done < <(sudo docker image ls --format '{{.Repository}}\t{{.Tag}}')

sudo docker ps --filter "name=^/${CONTAINER_NAME}$" --format 'container={{.Names}} image={{.Image}} status={{.Status}} ports={{.Ports}}'
sudo rm -f "${REMOTE_DIR}/${ARCHIVE_NAME}"
PRIVATE
rm -f "${REMOTE_DIR}/${ARCHIVE_NAME}"
BASTION

echo "DEPLOY SUCCESS: ${IMAGE_TAG} on ${PRIVATE_HOST}:${HOST_PORT}"
LEGACY_DEPLOY_REFERENCE
