#!/usr/bin/env bash
set -euo pipefail

# BSF Publishing Service — deploy to Hetzner VPS
#
# Usage:
#   ./deploy.sh <hetzner-ip> [ssh-key]
#
# Prerequisites on the VPS:
#   - podman installed
#   - caddy installed and configured for publish.buildsomething.fun
#   - /opt/bsf-publish/.env with secrets (SERVICE_KEYPAIR_PATH, BUILD_SECRET, etc.)
#   - /opt/bsf-publish/service-keypair.json

HETZNER_IP="${1:?Usage: ./deploy.sh <hetzner-ip> [ssh-key]}"
SSH_KEY="${2:-}"
CONTAINER_NAME="bsf-publish"
REMOTE_DIR="/opt/bsf-publish"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

echo "==> Deploying to $HETZNER_IP"

# 1. Sync source to the VPS
echo "==> Syncing source files..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  -e "ssh $SSH_OPTS" \
  ./ "root@${HETZNER_IP}:${REMOTE_DIR}/src/"

# 2. Build container on the VPS
echo "==> Building container on VPS..."
ssh $SSH_OPTS "root@${HETZNER_IP}" bash -s <<'REMOTE_BUILD'
set -euo pipefail
cd /opt/bsf-publish/src
podman build -t bsf-publish -f Containerfile .
REMOTE_BUILD

# 3. Stop old container, start new one
echo "==> Restarting container..."
ssh $SSH_OPTS "root@${HETZNER_IP}" bash -s <<'REMOTE_RUN'
set -euo pipefail

podman stop bsf-publish 2>/dev/null || true
podman rm bsf-publish 2>/dev/null || true

podman run -d \
  --name bsf-publish \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file /opt/bsf-publish/.env \
  -v /opt/bsf-publish/service-keypair.json:/app/service-keypair.json:ro \
  bsf-publish

echo "==> Container started"
podman ps --filter name=bsf-publish
REMOTE_RUN

echo "==> Deploy complete. Container running on $HETZNER_IP:3000"
echo "    Make sure Caddy is proxying publish.buildsomething.fun -> localhost:3000"
