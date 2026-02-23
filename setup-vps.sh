#!/usr/bin/env bash
set -euo pipefail

# BSF Publishing Service — VPS initial setup
#
# Run this ONCE on a fresh Hetzner VPS (Ubuntu 22.04+):
#   ssh root@<ip> 'bash -s' < setup-vps.sh
#
# After setup, use deploy.sh for subsequent deployments.

echo "==> Installing podman..."
apt-get update
apt-get install -y podman

echo "==> Installing caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

echo "==> Creating app directory..."
mkdir -p /opt/bsf-publish

echo "==> Setting up Caddyfile..."
cat > /etc/caddy/Caddyfile <<'EOF'
publish.buildsomething.fun {
	reverse_proxy localhost:3000
}
EOF

systemctl enable caddy
systemctl restart caddy

echo "==> VPS setup complete."
echo ""
echo "Next steps:"
echo "  1. Create /opt/bsf-publish/.env with:"
echo "     PORT=3000"
echo "     RPC_URL=https://api.devnet.solana.com"
echo "     SERVICE_KEYPAIR_PATH=/app/service-keypair.json"
echo "     TURBO_BUFFER_PERCENTAGE=20"
echo "     BUILD_SECRET=<generate-a-secret>"
echo "     ANDROID_TEMPLATE_PATH=/app/webview-template"
echo ""
echo "  2. Copy service-keypair.json to /opt/bsf-publish/service-keypair.json"
echo ""
echo "  3. Point DNS: publish.buildsomething.fun -> $(curl -s ifconfig.me)"
echo ""
echo "  4. Run deploy.sh from your local machine"
