#!/usr/bin/env bash
# ============================================================
# CTM Platform — Server setup script
# Run once on a fresh Ubuntu 22.04 / Debian 12 server
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/morrissnhsieh-sudo/CTM/main/deploy/scripts/setup-server.sh | sudo bash
# ============================================================

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${CYAN}[CTM]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC}  $1"; }
warn() { echo -e "${YELLOW}[!!]${NC}  $1"; }

log "CTM Production Server Setup"
log "============================"

# ── 1. Update system ──────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
ok "System updated"

# ── 2. Install Docker ──────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed: $(docker --version)"
else
  ok "Docker already installed: $(docker --version)"
fi

# Add current user to docker group
usermod -aG docker "${SUDO_USER:-$USER}" 2>/dev/null || true

# ── 3. Configure firewall ─────────────────────────────────────────────────────
log "Configuring UFW firewall..."
apt-get install -y -qq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
# Internal ports (no external access needed):
# 5432 postgres, 6379 redis, 9092 kafka, 8080 keycloak, etc.
ufw --force enable
ok "Firewall configured (ports: 22, 80, 443)"

# ── 4. Install Certbot ────────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  log "Installing Certbot..."
  apt-get install -y -qq certbot
  ok "Certbot installed"
fi

# ── 5. Create secrets directory ───────────────────────────────────────────────
log "Creating secrets directory..."
mkdir -p /etc/ctm/secrets
chmod 700 /etc/ctm/secrets
ok "Secrets dir: /etc/ctm/secrets (mode 700)"

# ── 6. System tuning for production ──────────────────────────────────────────
log "Tuning kernel parameters..."
cat >> /etc/sysctl.conf << 'EOF'
# CTM production tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
fs.file-max = 1000000
vm.overcommit_memory = 1
EOF
sysctl -p >/dev/null 2>&1
ok "Kernel parameters tuned"

# Increase open file limits
cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 65535
* hard nofile 65535
EOF

# ── 7. Install useful tools ───────────────────────────────────────────────────
log "Installing tools..."
apt-get install -y -qq git curl jq htop

# ── 8. Summary ────────────────────────────────────────────────────────────────
echo ""
ok "Server setup complete!"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo "  1. Run: bash deploy/scripts/setup-secrets.sh"
echo "  2. Run: bash deploy/scripts/get-ssl-cert.sh your-domain.com your@email.com"
echo "  3. Run: bash deploy/scripts/deploy.sh"
echo ""
warn "Log out and back in for docker group membership to take effect"
