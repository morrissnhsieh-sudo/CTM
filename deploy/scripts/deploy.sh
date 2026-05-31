#!/usr/bin/env bash
# ============================================================
# CTM Platform — Production deployment script
#
# Usage:
#   bash deploy/scripts/deploy.sh [--rebuild]
#
# Flags:
#   --rebuild   Force rebuild of all Docker images
#   --version   Tag to deploy (default: latest)
# ============================================================

set -euo pipefail

REBUILD=false
VERSION="latest"

for arg in "$@"; do
  case $arg in
    --rebuild) REBUILD=true ;;
    --version=*) VERSION="${arg#*=}" ;;
  esac
done

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "\n${CYAN}  --> $1${NC}"; }
ok()   { echo -e "${GREEN}  [OK]  $1${NC}"; }
warn() { echo -e "${YELLOW}  [!!]  $1${NC}"; }
fail() { echo -e "${RED}  [X]   $1${NC}"; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo -e "${CYAN}  ================================================================${NC}"
echo -e "${CYAN}  |        CTM Platform  -  Production Deployment               |${NC}"
echo -e "${CYAN}  ================================================================${NC}"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
log "Pre-flight checks"

command -v docker &>/dev/null || fail "Docker not installed"
docker compose version &>/dev/null || fail "docker compose not found"

[[ -f /etc/ctm/secrets/pg_password.txt   ]] || fail "Missing secret: pg_password.txt (run setup-secrets.sh)"
[[ -f /etc/ctm/secrets/redis_password.txt ]] || fail "Missing secret: redis_password.txt"
[[ -f /etc/ctm/secrets/vertex_key.json   ]] || warn "Missing vertex_key.json — AI features will be degraded"

[[ -f .env.prod ]] || fail ".env.prod not found — copy .env.prod.example and fill in your domain"

ok "Pre-flight checks passed"

# ── Load environment ──────────────────────────────────────────────────────────
log "Loading .env.prod"
set -a; source .env.prod; set +a
export VERSION
ok "Environment loaded (DOMAIN=$DOMAIN, VERSION=$VERSION)"

# ── Update Nginx config with actual domain ────────────────────────────────────
log "Configuring Nginx for domain: $DOMAIN"
sed -i "s/ctm\.example\.com/$DOMAIN/g" deploy/nginx/conf.d/ctm.conf
ok "Nginx config updated"

# ── Pull / build images ───────────────────────────────────────────────────────
log "Building/pulling Docker images"

if [[ "$REBUILD" == "true" ]]; then
  docker compose -f deploy/docker-compose.prod.yml build --no-cache
else
  docker compose -f deploy/docker-compose.prod.yml build
fi
ok "Images ready"

# ── Start infrastructure first ────────────────────────────────────────────────
log "Starting infrastructure (PostgreSQL, Redis, Kafka, MinIO)"
docker compose -f deploy/docker-compose.prod.yml up -d postgres redis kafka minio

# Wait for PostgreSQL
echo "  Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose -f deploy/docker-compose.prod.yml exec -T postgres pg_isready -U ctm 2>/dev/null; then
    ok "PostgreSQL ready"
    break
  fi
  sleep 3
  [[ $i -eq 30 ]] && fail "PostgreSQL did not become ready"
done

# MinIO bucket init
docker compose -f deploy/docker-compose.prod.yml up minio-init --no-log-prefix 2>&1 | tail -2

# ── Start Nginx (HTTP only, for ACME challenge) ────────────────────────────────
log "Starting Nginx"
docker compose -f deploy/docker-compose.prod.yml up -d nginx
ok "Nginx started"

# ── Start Keycloak ────────────────────────────────────────────────────────────
log "Starting Keycloak (first boot takes ~60s)"
docker compose -f deploy/docker-compose.prod.yml up -d keycloak

echo "  Waiting for Keycloak..."
for i in $(seq 1 40); do
  if curl -sf "http://localhost:8080/health/ready" &>/dev/null 2>&1 || \
     docker compose -f deploy/docker-compose.prod.yml exec -T nginx wget -qO- http://keycloak:8080/health/ready &>/dev/null 2>&1; then
    ok "Keycloak ready"
    break
  fi
  sleep 5
  [[ $i -eq 40 ]] && warn "Keycloak may still be starting — proceeding anyway"
done

# ── Start application services ────────────────────────────────────────────────
log "Starting application microservices"
docker compose -f deploy/docker-compose.prod.yml up -d \
  collab-service api-service pm-service ai-service messaging-service
ok "Application services started"

# ── Start frontend ────────────────────────────────────────────────────────────
log "Starting Frontend"
docker compose -f deploy/docker-compose.prod.yml up -d frontend
ok "Frontend started"

# ── Certbot ───────────────────────────────────────────────────────────────────
log "Starting Certbot renewal daemon"
docker compose -f deploy/docker-compose.prod.yml up -d certbot

# ── Final status ──────────────────────────────────────────────────────────────
sleep 5
echo ""
echo -e "${CYAN}  === Container Status ===${NC}"
docker compose -f deploy/docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}"

echo ""
echo -e "${GREEN}  ================================================================${NC}"
echo -e "${GREEN}  |              CTM Platform deployed!                         |${NC}"
echo -e "${GREEN}  ================================================================${NC}"
echo ""
echo "  Frontend:    https://app.$DOMAIN"
echo "  API:         https://api.$DOMAIN/v1/docs"
echo "  Auth:        https://auth.$DOMAIN/admin"
echo ""
echo "  To check logs: docker compose -f deploy/docker-compose.prod.yml logs -f api-service"
echo "  To update:     bash deploy/scripts/deploy.sh"
echo ""
