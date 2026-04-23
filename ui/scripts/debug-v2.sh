#!/usr/bin/env bash
# Diagnoses why reflector.local/v2/ isn't serving the SPA.
# Usage: ./ui/scripts/debug-v2.sh [host]  (default host: reflector.local)
set +e
HOST="${1:-reflector.local}"
COMPOSE="docker compose -f docker-compose.selfhosted.yml"

echo "============================================================"
echo " 1. Container status"
echo "============================================================"
$COMPOSE ps ui caddy web 2>&1 | head -20

echo
echo "============================================================"
echo " 2. Live Caddyfile inside the caddy container"
echo "============================================================"
$COMPOSE exec -T caddy cat /etc/caddy/Caddyfile 2>&1 | sed -n '/handle \/v2\|handle {/{p;n;p;n;p;}' | head -20
echo "--- full handle blocks (first 40 lines) ---"
$COMPOSE exec -T caddy cat /etc/caddy/Caddyfile 2>&1 | grep -nE 'handle|reverse_proxy|tls' | head -40

echo
echo "============================================================"
echo " 3. nginx config inside the ui container"
echo "============================================================"
$COMPOSE exec -T ui cat /etc/nginx/conf.d/default.conf 2>&1

echo
echo "============================================================"
echo " 4. dist contents inside the ui container"
echo "============================================================"
$COMPOSE exec -T ui ls -la /usr/share/nginx/html/v2/ 2>&1 | head -20

echo
echo "============================================================"
echo " 5. Direct nginx probe (bypass Caddy) — container -> container"
echo "============================================================"
echo "--- GET http://ui/v2/ from inside caddy ---"
$COMPOSE exec -T caddy wget -qO- --server-response http://ui/v2/ 2>&1 | head -40
echo
echo "--- GET http://ui/v2 (no slash) from inside caddy ---"
$COMPOSE exec -T caddy wget -qO- --server-response http://ui/v2 2>&1 | head -20

echo
echo "============================================================"
echo " 6. Caddy probe from host"
echo "============================================================"
echo "--- GET https://$HOST/v2/ ---"
curl -sk -o /dev/null -D - "https://$HOST/v2/" 2>&1 | head -20
echo
echo "--- GET https://$HOST/v2 (no slash) ---"
curl -sk -o /dev/null -D - "https://$HOST/v2" 2>&1 | head -20
echo
echo "--- body of https://$HOST/v2/ (first 30 lines) ---"
curl -sk "https://$HOST/v2/" 2>&1 | head -30

echo
echo "============================================================"
echo " 7. Recent ui + caddy logs"
echo "============================================================"
echo "--- ui (last 30 lines) ---"
$COMPOSE logs --tail=30 ui 2>&1 | tail -30
echo "--- caddy (last 30 lines) ---"
$COMPOSE logs --tail=30 caddy 2>&1 | tail -30
