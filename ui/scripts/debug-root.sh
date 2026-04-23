#!/usr/bin/env bash
# Diagnoses why the raw domain (https://reflector.local/) isn't loading.
# Usage: ./ui/scripts/debug-root.sh [host]
set +e
HOST="${1:-reflector.local}"
COMPOSE="docker compose -f docker-compose.selfhosted.yml"

echo "============================================================"
echo " 1. Container status (web + caddy)"
echo "============================================================"
$COMPOSE ps web caddy 2>&1 | head -10

echo
echo "============================================================"
echo " 2. HTTPS probe to https://$HOST/"
echo "============================================================"
curl -skv "https://$HOST/" 2>&1 | head -60

echo
echo "============================================================"
echo " 3. Body snippet"
echo "============================================================"
curl -sk "https://$HOST/" 2>&1 | head -30

echo
echo "============================================================"
echo " 4. Direct web:3000 probe from inside caddy"
echo "============================================================"
$COMPOSE exec -T caddy wget -qO- --server-response http://web:3000/ 2>&1 | head -30

echo
echo "============================================================"
echo " 5. NextAuth URL / relevant web env (from inside web)"
echo "============================================================"
$COMPOSE exec -T web printenv 2>&1 | grep -E 'NEXTAUTH|NEXT_PUBLIC|SERVER_API_URL' | head -10

echo
echo "============================================================"
echo " 6. web container logs (last 40 lines)"
echo "============================================================"
$COMPOSE logs --tail=40 web 2>&1 | tail -40

echo
echo "============================================================"
echo " 7. caddy recent errors to the web upstream (last 10)"
echo "============================================================"
$COMPOSE logs --tail=200 caddy 2>&1 | grep -Ei 'error|web:3000|dial tcp' | tail -10
