#!/usr/bin/env bash
set -euo pipefail

IMAGE_REPOSITORY="ai-physical-workspace"
IMAGE_TAG="${IMAGE_REPOSITORY}:aws$(date +'%Y%m%d%H%M')"
CONTAINER_NAME="ai-physical-workspace"
HOST_PORT="3010"
CONTAINER_PORT="3000"
BASTION_HOST="${BASTION_HOST:-ubuntu@43.202.136.180}"
PRIVATE_HOST="${PRIVATE_HOST:-ubuntu@172.31.76.194}"
WINDOWS_SSH_KEY="${WINDOWS_SSH_KEY:-/mnt/c/Users/hcjeo/.ssh/penvotkeypair1.pem}"
LOCAL_SSH_KEY="${LOCAL_SSH_KEY:-/tmp/ai-workspace-deploy-key.pem}"
BASTION_SSH_KEY="${BASTION_SSH_KEY:-/home/ubuntu/.ssh/penvotkeypair1.pem}"
REMOTE_DIR="/home/ubuntu"
DATA_DIR="/home/ubuntu/ai-workspace-data"
GCP_KEY="/home/ubuntu/gcp-key.json"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ARCHIVE_NAME="ai-workspace-source-$(date +'%Y%m%d%H%M').tar.gz"

cleanup() {
  rm -f "${ROOT_DIR}/${ARCHIVE_NAME}" "${LOCAL_SSH_KEY}"
}
trap cleanup EXIT

test -f "${WINDOWS_SSH_KEY}" || { echo "Missing Windows SSH key: ${WINDOWS_SSH_KEY}"; exit 1; }
test -f "${SCRIPT_DIR}/.env.production" || { echo "Missing production environment file"; exit 1; }
install -m 600 "${WINDOWS_SSH_KEY}" "${LOCAL_SSH_KEY}"

cd "${ROOT_DIR}"
tar --exclude=.git --exclude=node_modules --exclude=.next --exclude=data --exclude='*.tar*' -czf "${ARCHIVE_NAME}" .
scp -o StrictHostKeyChecking=accept-new -i "${LOCAL_SSH_KEY}" "${ARCHIVE_NAME}" "${BASTION_HOST}:${REMOTE_DIR}/${ARCHIVE_NAME}"

ssh -o StrictHostKeyChecking=accept-new -i "${LOCAL_SSH_KEY}" "${BASTION_HOST}" \
  PRIVATE_HOST="${PRIVATE_HOST}" BASTION_SSH_KEY="${BASTION_SSH_KEY}" REMOTE_DIR="${REMOTE_DIR}" \
  ARCHIVE_NAME="${ARCHIVE_NAME}" IMAGE_TAG="${IMAGE_TAG}" CONTAINER_NAME="${CONTAINER_NAME}" \
  HOST_PORT="${HOST_PORT}" CONTAINER_PORT="${CONTAINER_PORT}" DATA_DIR="${DATA_DIR}" GCP_KEY="${GCP_KEY}" bash -s <<'BASTION'
set -euo pipefail
test -f "${BASTION_SSH_KEY}" || { echo "Missing bastion SSH key: ${BASTION_SSH_KEY}"; exit 1; }
scp -o StrictHostKeyChecking=accept-new -i "${BASTION_SSH_KEY}" "${REMOTE_DIR}/${ARCHIVE_NAME}" "${PRIVATE_HOST}:${REMOTE_DIR}/${ARCHIVE_NAME}"
ssh -o StrictHostKeyChecking=accept-new -i "${BASTION_SSH_KEY}" "${PRIVATE_HOST}" \
  REMOTE_DIR="${REMOTE_DIR}" ARCHIVE_NAME="${ARCHIVE_NAME}" IMAGE_TAG="${IMAGE_TAG}" \
  CONTAINER_NAME="${CONTAINER_NAME}" HOST_PORT="${HOST_PORT}" CONTAINER_PORT="${CONTAINER_PORT}" \
  DATA_DIR="${DATA_DIR}" GCP_KEY="${GCP_KEY}" bash -s <<'PRIVATE'
set -euo pipefail
BUILD_DIR="$(mktemp -d /home/ubuntu/ai-workspace-build.XXXXXX)"
cleanup_private() { sudo rm -rf -- "${BUILD_DIR}"; }
trap cleanup_private EXIT

test -f "${GCP_KEY}" || { echo "Missing GCP key: ${GCP_KEY}"; exit 1; }
tar -xzf "${REMOTE_DIR}/${ARCHIVE_NAME}" -C "${BUILD_DIR}"
sudo docker build -f "${BUILD_DIR}/.fordeploy/ai-workspace-aws/Dockerfile" -t "${IMAGE_TAG}" "${BUILD_DIR}"
sudo install -d -o 1001 -g 1001 "${DATA_DIR}"
sudo docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
sudo docker run -d --restart unless-stopped \
  --name "${CONTAINER_NAME}" -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -v "${DATA_DIR}:/app/data" -v "${GCP_KEY}:/app/gcp-key.json:ro" "${IMAGE_TAG}"

for attempt in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:${HOST_PORT}/api/ready" >/dev/null; then break; fi
  if [ "${attempt}" -eq 30 ]; then sudo docker logs --tail 200 "${CONTAINER_NAME}"; exit 1; fi
  sleep 2
done
sudo docker ps --filter "name=^/${CONTAINER_NAME}$" --format 'container={{.Names}} image={{.Image}} status={{.Status}} ports={{.Ports}}'
sudo rm -f "${REMOTE_DIR}/${ARCHIVE_NAME}"
PRIVATE
rm -f "${REMOTE_DIR}/${ARCHIVE_NAME}"
BASTION

echo "DEPLOY SUCCESS: ${IMAGE_TAG} on ${PRIVATE_HOST}:${HOST_PORT}"
