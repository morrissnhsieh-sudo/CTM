#!/usr/bin/env bash
# ============================================================
# CTM Platform — Generate and store production secrets
# Run once on the production server
#
# Creates strong random secrets in /etc/ctm/secrets/
# ============================================================

set -euo pipefail

SECRETS_DIR="/etc/ctm/secrets"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}  $1"; }
warn() { echo -e "${YELLOW}[!!]${NC}  $1"; }

echo "CTM — Generating production secrets"
echo "===================================="

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

gen() {
  # Generate a cryptographically random 32-char alphanumeric secret
  openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 32
}

gen_hex() {
  openssl rand -hex 32
}

# ── PostgreSQL ────────────────────────────────────────────────────────────────
if [[ ! -f "$SECRETS_DIR/pg_user.txt" ]]; then
  echo -n "ctm" > "$SECRETS_DIR/pg_user.txt"
  ok "pg_user.txt created"
fi

if [[ ! -f "$SECRETS_DIR/pg_password.txt" ]]; then
  gen > "$SECRETS_DIR/pg_password.txt"
  ok "pg_password.txt generated"
else
  warn "pg_password.txt already exists — skipping"
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
if [[ ! -f "$SECRETS_DIR/redis_password.txt" ]]; then
  gen > "$SECRETS_DIR/redis_password.txt"
  ok "redis_password.txt generated"
else
  warn "redis_password.txt already exists — skipping"
fi

# ── MinIO ─────────────────────────────────────────────────────────────────────
if [[ ! -f "$SECRETS_DIR/minio_user.txt" ]]; then
  echo -n "ctm_admin" > "$SECRETS_DIR/minio_user.txt"
  ok "minio_user.txt created"
fi

if [[ ! -f "$SECRETS_DIR/minio_password.txt" ]]; then
  gen > "$SECRETS_DIR/minio_password.txt"
  ok "minio_password.txt generated"
else
  warn "minio_password.txt already exists — skipping"
fi

# ── Keycloak admin ────────────────────────────────────────────────────────────
if [[ ! -f "$SECRETS_DIR/keycloak_admin.txt" ]]; then
  echo -n "admin" > "$SECRETS_DIR/keycloak_admin.txt"
  ok "keycloak_admin.txt created"
fi

if [[ ! -f "$SECRETS_DIR/keycloak_admin_password.txt" ]]; then
  gen > "$SECRETS_DIR/keycloak_admin_password.txt"
  ok "keycloak_admin_password.txt generated"
else
  warn "keycloak_admin_password.txt already exists — skipping"
fi

# ── Vertex AI key ─────────────────────────────────────────────────────────────
VERTEX_SRC="${VERTEX_KEY_PATH:-}"
if [[ -n "$VERTEX_SRC" && -f "$VERTEX_SRC" ]]; then
  cp "$VERTEX_SRC" "$SECRETS_DIR/vertex_key.json"
  chmod 600 "$SECRETS_DIR/vertex_key.json"
  ok "vertex_key.json copied from $VERTEX_SRC"
elif [[ -f "$SECRETS_DIR/vertex_key.json" ]]; then
  ok "vertex_key.json already present"
else
  warn "Vertex AI key NOT found. Copy manually:"
  warn "  scp your-key.json user@server:/etc/ctm/secrets/vertex_key.json"
fi

# ── Lock down permissions ─────────────────────────────────────────────────────
chmod 600 "$SECRETS_DIR"/*.txt 2>/dev/null || true
chmod 600 "$SECRETS_DIR"/*.json 2>/dev/null || true
chown root:root "$SECRETS_DIR"/* 2>/dev/null || true

echo ""
ok "All secrets stored in $SECRETS_DIR"
echo ""
echo "  Keycloak admin password: $(cat $SECRETS_DIR/keycloak_admin_password.txt)"
echo "  PostgreSQL password:     $(cat $SECRETS_DIR/pg_password.txt)"
echo ""
warn "Store these passwords securely — they won't be shown again!"
