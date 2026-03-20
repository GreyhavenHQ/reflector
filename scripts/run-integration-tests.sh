#!/usr/bin/env bash
#
# Run integration tests locally.
#
# Spins up the full stack via Docker Compose, runs the three integration tests,
# and tears everything down afterward.
#
# Required environment variables:
#   LLM_URL      — OpenAI-compatible LLM endpoint (e.g. https://api.openai.com/v1)
#   LLM_API_KEY  — API key for the LLM endpoint
#   HF_TOKEN     — HuggingFace token for pyannote gated models
#
# Optional:
#   LLM_MODEL    — Model name (default: qwen2.5:14b)
#
# Flags:
#   --build      — Rebuild backend Docker images (server, workers, test-runner)
#
# Usage:
#   export LLM_URL="https://api.openai.com/v1"
#   export LLM_API_KEY="sk-..."
#   export HF_TOKEN="hf_..."
#   ./scripts/run-integration-tests.sh
#   ./scripts/run-integration-tests.sh --build   # rebuild backend images
#
set -euo pipefail

BUILD_FLAG=""
for arg in "$@"; do
    case "$arg" in
        --build) BUILD_FLAG="--build" ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/server/tests"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.integration.yml"
COMPOSE="docker compose -f $COMPOSE_FILE"

# ── Validate required env vars ──────────────────────────────────────────────
for var in LLM_URL LLM_API_KEY HF_TOKEN; do
    if [[ -z "${!var:-}" ]]; then
        echo "ERROR: $var is not set. See script header for required env vars."
        exit 1
    fi
done

export LLM_MODEL="${LLM_MODEL:-qwen2.5:14b}"

# ── Helpers ─────────────────────────────────────────────────────────────────
info()  { echo -e "\n\033[1;34m▸ $*\033[0m"; }
ok()    { echo -e "\033[1;32m  ✓ $*\033[0m"; }
fail()  { echo -e "\033[1;31m  ✗ $*\033[0m"; }

wait_for() {
    local desc="$1" cmd="$2" max="${3:-60}"
    info "Waiting for $desc (up to ${max}s)..."
    for i in $(seq 1 "$max"); do
        if eval "$cmd" &>/dev/null; then
            ok "$desc is ready"
            return 0
        fi
        sleep 2
    done
    fail "$desc did not become ready within ${max}s"
    return 1
}

cleanup() {
    info "Tearing down..."
    $COMPOSE down -v --remove-orphans 2>/dev/null || true
}

# Always tear down on exit
trap cleanup EXIT

# ── Step 1: Build and start infrastructure ──────────────────────────────────
info "Building and starting infrastructure services..."
$COMPOSE up -d --build postgres redis garage hatchet mock-daily mailpit

# ── Step 2: Set up Garage (S3 bucket + keys) ───────────────────────────────
wait_for "Garage" "$COMPOSE exec -T garage /garage stats" 60

info "Setting up Garage bucket and keys..."
GARAGE="$COMPOSE exec -T garage /garage"

# Hardcoded test credentials — ephemeral containers, destroyed after tests
export GARAGE_KEY_ID="GK0123456789abcdef01234567" # gitleaks:allow
export GARAGE_KEY_SECRET="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" # gitleaks:allow

# Layout
NODE_ID=$($GARAGE node id -q 2>&1 | tr -d '[:space:]')
LAYOUT_STATUS=$($GARAGE layout show 2>&1 || true)
if echo "$LAYOUT_STATUS" | grep -q "No nodes"; then
    $GARAGE layout assign "$NODE_ID" -c 1G -z dc1
    $GARAGE layout apply --version 1
fi

# Bucket
$GARAGE bucket info reflector-media >/dev/null 2>&1 || $GARAGE bucket create reflector-media

# Import key with known credentials
if ! $GARAGE key info reflector-test >/dev/null 2>&1; then
    $GARAGE key import --yes "$GARAGE_KEY_ID" "$GARAGE_KEY_SECRET"
    $GARAGE key rename "$GARAGE_KEY_ID" reflector-test
fi

# Permissions
$GARAGE bucket allow reflector-media --read --write --key reflector-test

ok "Garage ready with hardcoded test credentials"

# ── Step 3: Generate Hatchet API token ──────────────────────────────────────
wait_for "Hatchet" "$COMPOSE exec -T hatchet curl -sf http://localhost:8888/api/live" 90

info "Generating Hatchet API token..."
HATCHET_TOKEN_OUTPUT=$($COMPOSE exec -T hatchet /hatchet-admin token create --config /config --name local-test 2>&1)
export HATCHET_CLIENT_TOKEN=$(echo "$HATCHET_TOKEN_OUTPUT" | grep -o 'eyJ[A-Za-z0-9_.\-]*')

if [[ -z "$HATCHET_CLIENT_TOKEN" ]]; then
    fail "Failed to extract Hatchet token (JWT not found in output)"
    echo "  Output was: $HATCHET_TOKEN_OUTPUT"
    exit 1
fi
ok "Hatchet token generated"

# ── Step 4: Start backend services ──────────────────────────────────────────
info "Starting backend services..."
$COMPOSE up -d $BUILD_FLAG server worker hatchet-worker-cpu hatchet-worker-llm test-runner

# ── Step 5: Wait for server + run migrations ────────────────────────────────
wait_for "Server" "$COMPOSE exec -T test-runner curl -sf http://server:1250/health" 60

info "Running database migrations..."
$COMPOSE exec -T server uv run alembic upgrade head
ok "Migrations applied"

# ── Step 6: Run integration tests ───────────────────────────────────────────
info "Running integration tests..."
echo ""

LOGS_DIR="$COMPOSE_DIR/integration/logs"
mkdir -p "$LOGS_DIR"
RUN_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TEST_LOG="$LOGS_DIR/$RUN_TIMESTAMP.txt"

if $COMPOSE exec -T test-runner uv run pytest tests/integration/ -v -x 2>&1 | tee "$TEST_LOG.pytest"; then
    echo ""
    ok "All integration tests passed!"
    EXIT_CODE=0
else
    echo ""
    fail "Integration tests failed!"
    EXIT_CODE=1
fi

# Always collect service logs + test output into a single file
info "Collecting logs..."
$COMPOSE logs --tail=500 > "$TEST_LOG" 2>&1
echo -e "\n\n=== PYTEST OUTPUT ===\n" >> "$TEST_LOG"
cat "$TEST_LOG.pytest" >> "$TEST_LOG" 2>/dev/null
rm -f "$TEST_LOG.pytest"
echo "  Logs saved to: server/tests/integration/logs/$RUN_TIMESTAMP.txt"

# cleanup runs via trap
exit $EXIT_CODE
