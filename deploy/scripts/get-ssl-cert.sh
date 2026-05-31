#!/usr/bin/env bash
# ============================================================
# CTM Platform — Obtain Let's Encrypt SSL certificates
#
# Usage:
#   bash deploy/scripts/get-ssl-cert.sh ctm.example.com admin@example.com
# ============================================================

set -euo pipefail

DOMAIN="${1:?Usage: $0 <domain> <email>}"
EMAIL="${2:?Usage: $0 <domain> <email>}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}  $1"; }
warn() { echo -e "${YELLOW}[!!]${NC}  $1"; }

echo "Obtaining SSL certificates for *.$DOMAIN"

# The subdomains CTM uses
SUBDOMAINS="app.$DOMAIN,api.$DOMAIN,auth.$DOMAIN,collab.$DOMAIN,chat.$DOMAIN"

# Ensure port 80 is available for ACME challenge
# (nginx must be running with the certbot-www volume)

certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN" \
  -d "$SUBDOMAINS"

ok "Certificates obtained for $DOMAIN and subdomains"
warn "Update deploy/nginx/conf.d/ctm.conf — replace 'ctm.example.com' with '$DOMAIN'"

# Auto-renew cron
(crontab -l 2>/dev/null; echo "0 12 * * * certbot renew --quiet") | crontab -
ok "Auto-renewal cron added (daily at 12:00)"
