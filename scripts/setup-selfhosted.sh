#!/usr/bin/env bash
#
# Self-hosted production setup for Reflector.
# Single script to configure and launch everything on one server.
#
# Usage:
#   ./scripts/setup-selfhosted.sh <--gpu|--cpu|--hosted> [options] [--transcript BACKEND] [--diarization BACKEND] [--translation BACKEND] [--padding BACKEND] [--mixdown BACKEND]
#   ./scripts/setup-selfhosted.sh                        (re-run with saved config from last run)
#
# ML processing modes (pick ONE — required on first run):
#   --gpu              NVIDIA GPU container for transcription/diarization/translation
#   --cpu              In-process CPU processing (no ML container, slower)
#   --hosted           Remote GPU service URL (no ML container)
#
# Per-service backend overrides (optional — override individual services from the base mode):
#   --transcript BACKEND    whisper | modal  (default: whisper for --cpu, modal for --gpu/--hosted)
#   --diarization BACKEND   pyannote | modal (default: pyannote for --cpu, modal for --gpu/--hosted)
#   --translation BACKEND   marian | modal | passthrough (default: marian for --cpu, modal for --gpu/--hosted)
#   --padding BACKEND       pyav | modal     (default: pyav for --cpu, modal for --gpu/--hosted)
#   --mixdown BACKEND       pyav | modal     (default: pyav for --cpu, modal for --gpu/--hosted)
#
# Local LLM (optional — for summarization & topic detection):
#   --ollama-gpu       Local Ollama with NVIDIA GPU acceleration
#   --ollama-cpu       Local Ollama on CPU only
#   --llm-model MODEL  Ollama model to use (default: qwen2.5:14b)
#   (If omitted, configure an external OpenAI-compatible LLM in server/.env)
#
# Optional flags:
#   --livekit          Enable LiveKit self-hosted video platform (generates credentials,
#                      starts livekit-server + livekit-egress containers)
#   --ip IP            Set the server's IP address for all URLs. Implies --caddy
#                      (self-signed HTTPS, required for browser mic/camera access).
#                      Mutually exclusive with --domain. Use for LAN or cloud VM access.
#                      On Linux, IP is auto-detected; on macOS, use --ip to specify it.
#   --garage           Use Garage for local S3-compatible storage
#   --caddy            Enable Caddy reverse proxy with auto-SSL
#   --domain DOMAIN    Use a real domain for Caddy (enables Let's Encrypt auto-HTTPS)
#                      Requires: DNS pointing to this server + ports 80/443 open
#                      Without --domain: Caddy uses self-signed cert for IP access
#   --custom-ca PATH   Custom CA certificate for private HTTPS services
#                      PATH can be a directory (containing ca.crt, optionally server.pem + server-key.pem)
#                      or a single PEM file (CA trust only, no Caddy TLS)
#                      With server.pem+server-key.pem: Caddy serves HTTPS using those certs (requires --domain)
#                      Without: only injects CA trust into backend containers for outbound calls
#   --extra-ca FILE    Additional CA cert to trust (can be repeated for multiple CAs)
#                      Appended to the CA bundle so backends trust multiple authorities
#   --password PASS    Enable password auth with admin@localhost user
#   --build            Build backend and frontend images from source instead of pulling
#
# Examples:
#   ./scripts/setup-selfhosted.sh --gpu --ollama-gpu --livekit --garage --caddy
#   ./scripts/setup-selfhosted.sh --gpu --ollama-gpu --livekit --garage --caddy --domain reflector.example.com
#   ./scripts/setup-selfhosted.sh --cpu --ollama-cpu --livekit --garage --caddy
#   ./scripts/setup-selfhosted.sh --hosted --livekit --garage --caddy
#   ./scripts/setup-selfhosted.sh --cpu --padding modal --garage --caddy
#   ./scripts/setup-selfhosted.sh --gpu --translation passthrough --garage --caddy
#   ./scripts/setup-selfhosted.sh --cpu --diarization modal --translation modal --garage
#   ./scripts/setup-selfhosted.sh --gpu --ollama-gpu --llm-model mistral --garage --caddy
#   ./scripts/setup-selfhosted.sh --gpu --garage --caddy --password mysecretpass
#   ./scripts/setup-selfhosted.sh --gpu --caddy --domain reflector.local --custom-ca certs/
#   ./scripts/setup-selfhosted.sh --hosted --custom-ca /path/to/corporate-ca.crt
#   ./scripts/setup-selfhosted.sh                       # re-run with saved config
#
# Config memory: after a successful run, flags are saved to data/.selfhosted-last-args.
# Re-running with no arguments replays the saved configuration automatically.
#
# The script auto-detects Daily.co (DAILY_API_KEY), Whereby (WHEREBY_API_KEY),
# and LiveKit (LIVEKIT_API_KEY) from server/.env.
# - Daily.co: enables Hatchet workflow services for multitrack recording processing.
# - LiveKit: enables livekit-server + livekit-egress containers (self-hosted,
#   generates livekit.yaml and egress.yaml configs automatically).
#
# Idempotent — safe to re-run at any time.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="$ROOT_DIR/docker-compose.selfhosted.yml"
SERVER_ENV="$ROOT_DIR/server/.env"
WWW_ENV="$ROOT_DIR/www/.env"
LAST_ARGS_FILE="$ROOT_DIR/data/.selfhosted-last-args"

OLLAMA_MODEL="qwen2.5:14b"
OS="$(uname -s)"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}==>${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  !${NC} $*"; }
err()   { echo -e "${RED}  ✗${NC} $*" >&2; }

# --- Helpers ---

dump_diagnostics() {
    local failed_svc="${1:-}"
    echo ""
    err "========== DIAGNOSTICS =========="

    err "Container status:"
    compose_cmd ps -a --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || true
    echo ""

    local stopped
    stopped=$(compose_cmd ps -a --format '{{.Name}}\t{{.Status}}' 2>/dev/null \
        | grep -iv 'up\|running' | awk -F'\t' '{print $1}' || true)
    for c in $stopped; do
        err "--- Logs for $c (exited/unhealthy) ---"
        docker logs --tail 30 "$c" 2>&1 || true
        echo ""
    done

    if [[ -n "$failed_svc" ]]; then
        err "--- Logs for $failed_svc (last 40) ---"
        compose_cmd logs "$failed_svc" --tail 40 2>&1 || true
    fi

    err "================================="
}

trap 'dump_diagnostics' ERR

detect_lan_ip() {
    case "$OS" in
        Darwin)
            for iface in en0 en1 en2 en3; do
                local ip
                ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
                if [[ -n "$ip" ]]; then
                    echo "$ip"
                    return
                fi
            done
            ;;
        Linux)
            ip route get 1.1.1.1 2>/dev/null | sed -n 's/.*src \([^ ]*\).*/\1/p'
            return
            ;;
    esac
    echo ""
}

wait_for_url() {
    local url="$1" label="$2" retries="${3:-30}" interval="${4:-2}"
    for i in $(seq 1 "$retries"); do
        if curl -sf "$url" > /dev/null 2>&1; then
            return 0
        fi
        echo -ne "\r  Waiting for $label... ($i/$retries)"
        sleep "$interval"
    done
    echo ""
    err "$label not responding at $url after $retries attempts"
    return 1
}

env_has_key() {
    local file="$1" key="$2"
    grep -q "^${key}=" "$file" 2>/dev/null
}

env_get() {
    local file="$1" key="$2"
    grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-
}

env_set() {
    local file="$1" key="$2" value="$3"
    if env_has_key "$file" "$key"; then
        if [[ "$OS" == "Darwin" ]]; then
            sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
        else
            sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        fi
    else
        echo "${key}=${value}" >> "$file"
    fi
}

compose_cmd() {
    local profiles="" files="-f $COMPOSE_FILE"
    [[ "$USE_CUSTOM_CA" == "true" ]] && files="$files -f $ROOT_DIR/docker-compose.ca.yml"
    for p in "${COMPOSE_PROFILES[@]}"; do
        profiles="$profiles --profile $p"
    done
    docker compose $files $profiles "$@"
}

# Compose command with only garage profile (for garage-only operations before full stack start)
compose_garage_cmd() {
    local files="-f $COMPOSE_FILE"
    [[ "$USE_CUSTOM_CA" == "true" ]] && files="$files -f $ROOT_DIR/docker-compose.ca.yml"
    docker compose $files --profile garage "$@"
}

# --- Config memory: replay last args if none provided ---
if [[ $# -eq 0 ]] && [[ -f "$LAST_ARGS_FILE" ]]; then
    SAVED_ARGS="$(cat "$LAST_ARGS_FILE")"
    if [[ -n "$SAVED_ARGS" ]]; then
        info "No flags provided — replaying saved configuration:"
        info "  $SAVED_ARGS"
        echo ""
        eval "set -- $SAVED_ARGS"
    fi
fi

# --- Parse arguments ---
MODEL_MODE=""       # gpu or cpu (required, mutually exclusive)
OLLAMA_MODE=""      # ollama-gpu or ollama-cpu (optional)
USE_GARAGE=false
USE_LIVEKIT=false
USE_CADDY=false
CUSTOM_DOMAIN=""    # optional domain for Let's Encrypt HTTPS
CUSTOM_IP=""        # optional --ip override (mutually exclusive with --caddy)
BUILD_IMAGES=false  # build backend/frontend from source
ADMIN_PASSWORD=""   # optional admin password for password auth
CUSTOM_CA=""        # --custom-ca: path to dir or CA cert file
USE_CUSTOM_CA=false # derived flag: true when --custom-ca is provided
EXTRA_CA_FILES=()   # --extra-ca: additional CA certs to trust (can be repeated)
OVERRIDE_TRANSCRIPT=""    # per-service override: whisper | modal
OVERRIDE_DIARIZATION=""   # per-service override: pyannote | modal
OVERRIDE_TRANSLATION=""   # per-service override: marian | modal | passthrough
OVERRIDE_PADDING=""       # per-service override: pyav | modal
OVERRIDE_MIXDOWN=""       # per-service override: pyav | modal

# Validate per-service backend override values
validate_backend() {
    local service="$1" value="$2"; shift 2; local valid=("$@")
    for v in "${valid[@]}"; do [[ "$value" == "$v" ]] && return 0; done
    err "--$service value '$value' is not valid. Choose one of: ${valid[*]}"
    exit 1
}

SKIP_NEXT=false
ARGS=("$@")
for i in "${!ARGS[@]}"; do
    if [[ "$SKIP_NEXT" == "true" ]]; then
        SKIP_NEXT=false
        continue
    fi
    arg="${ARGS[$i]}"
    case "$arg" in
        --gpu)
            [[ -n "$MODEL_MODE" ]] && { err "Cannot combine --gpu, --cpu, and --hosted. Pick one."; exit 1; }
            MODEL_MODE="gpu" ;;
        --cpu)
            [[ -n "$MODEL_MODE" ]] && { err "Cannot combine --gpu, --cpu, and --hosted. Pick one."; exit 1; }
            MODEL_MODE="cpu" ;;
        --hosted)
            [[ -n "$MODEL_MODE" ]] && { err "Cannot combine --gpu, --cpu, and --hosted. Pick one."; exit 1; }
            MODEL_MODE="hosted" ;;
        --ollama-gpu)
            [[ -n "$OLLAMA_MODE" ]] && { err "Cannot combine --ollama-gpu and --ollama-cpu. Pick one."; exit 1; }
            OLLAMA_MODE="ollama-gpu" ;;
        --ollama-cpu)
            [[ -n "$OLLAMA_MODE" ]] && { err "Cannot combine --ollama-gpu and --ollama-cpu. Pick one."; exit 1; }
            OLLAMA_MODE="ollama-cpu" ;;
        --llm-model)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--llm-model requires a model name (e.g. --llm-model mistral)"
                exit 1
            fi
            OLLAMA_MODEL="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --garage)       USE_GARAGE=true ;;
        --livekit)      USE_LIVEKIT=true ;;
        --caddy)        USE_CADDY=true ;;
        --ip)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--ip requires an IP address (e.g. --ip 192.168.0.100)"
                exit 1
            fi
            CUSTOM_IP="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --build)        BUILD_IMAGES=true ;;
        --password)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--password requires a password value (e.g. --password mysecretpass)"
                exit 1
            fi
            ADMIN_PASSWORD="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --domain)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--domain requires a domain name (e.g. --domain reflector.example.com)"
                exit 1
            fi
            CUSTOM_DOMAIN="${ARGS[$next_i]}"
            USE_CADDY=true  # --domain implies --caddy
            SKIP_NEXT=true ;;
        --custom-ca)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--custom-ca requires a path to a directory or PEM certificate file"
                exit 1
            fi
            CUSTOM_CA="${ARGS[$next_i]}"
            USE_CUSTOM_CA=true
            SKIP_NEXT=true ;;
        --extra-ca)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--extra-ca requires a path to a PEM certificate file"
                exit 1
            fi
            extra_ca_file="${ARGS[$next_i]}"
            if [[ ! -f "$extra_ca_file" ]]; then
                err "--extra-ca file not found: $extra_ca_file"
                exit 1
            fi
            EXTRA_CA_FILES+=("$extra_ca_file")
            USE_CUSTOM_CA=true
            SKIP_NEXT=true ;;
        --transcript)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--transcript requires a backend (whisper | modal)"
                exit 1
            fi
            validate_backend "transcript" "${ARGS[$next_i]}" whisper modal
            OVERRIDE_TRANSCRIPT="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --diarization)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--diarization requires a backend (pyannote | modal)"
                exit 1
            fi
            validate_backend "diarization" "${ARGS[$next_i]}" pyannote modal
            OVERRIDE_DIARIZATION="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --translation)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--translation requires a backend (marian | modal | passthrough)"
                exit 1
            fi
            validate_backend "translation" "${ARGS[$next_i]}" marian modal passthrough
            OVERRIDE_TRANSLATION="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --padding)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--padding requires a backend (pyav | modal)"
                exit 1
            fi
            validate_backend "padding" "${ARGS[$next_i]}" pyav modal
            OVERRIDE_PADDING="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --mixdown)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--mixdown requires a backend (pyav | modal)"
                exit 1
            fi
            validate_backend "mixdown" "${ARGS[$next_i]}" pyav modal
            OVERRIDE_MIXDOWN="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        *)
            err "Unknown argument: $arg"
            err "Usage: $0 <--gpu|--cpu|--hosted> [options] [--transcript BACKEND] [--diarization BACKEND] [--translation BACKEND] [--padding BACKEND] [--mixdown BACKEND]"
            exit 1
            ;;
    esac
done

# --- Validate flag combinations ---
if [[ -n "$CUSTOM_IP" ]] && [[ -n "$CUSTOM_DOMAIN" ]]; then
    err "--ip and --domain are mutually exclusive. Use --ip for IP-based access, or --domain for domain-based access."
    exit 1
fi
# --ip implies --caddy (browsers require HTTPS for mic/camera access on non-localhost)
if [[ -n "$CUSTOM_IP" ]]; then
    USE_CADDY=true
fi

# --- Save CLI args for config memory (re-run without flags) ---
if [[ $# -gt 0 ]]; then
    mkdir -p "$ROOT_DIR/data"
    printf '%q ' "$@" > "$LAST_ARGS_FILE"
fi

# --- Resolve --custom-ca flag ---
CA_CERT_PATH=""       # resolved path to CA certificate
TLS_CERT_PATH=""      # resolved path to server cert (optional, for Caddy TLS)
TLS_KEY_PATH=""       # resolved path to server key (optional, for Caddy TLS)

if [[ "$USE_CUSTOM_CA" == "true" ]]; then
    # Strip trailing slashes to avoid double-slash paths
    CUSTOM_CA="${CUSTOM_CA%/}"

    if [[ -z "$CUSTOM_CA" ]] && [[ -n "${EXTRA_CA_FILES[0]+x}" ]]; then
        # --extra-ca only (no --custom-ca): use first extra CA as the base
        CA_CERT_PATH="${EXTRA_CA_FILES[0]}"
        unset 'EXTRA_CA_FILES[0]'
        EXTRA_CA_FILES=("${EXTRA_CA_FILES[@]+"${EXTRA_CA_FILES[@]}"}")
    elif [[ -d "$CUSTOM_CA" ]]; then
        # Directory mode: look for convention files
        if [[ ! -f "$CUSTOM_CA/ca.crt" ]]; then
            err "CA certificate not found: $CUSTOM_CA/ca.crt"
            err "Directory must contain ca.crt (and optionally server.pem + server-key.pem)"
            exit 1
        fi
        CA_CERT_PATH="$CUSTOM_CA/ca.crt"
        # Server cert/key are optional — if both present, use for Caddy TLS
        if [[ -f "$CUSTOM_CA/server.pem" ]] && [[ -f "$CUSTOM_CA/server-key.pem" ]]; then
            TLS_CERT_PATH="$CUSTOM_CA/server.pem"
            TLS_KEY_PATH="$CUSTOM_CA/server-key.pem"
        elif [[ -f "$CUSTOM_CA/server.pem" ]] || [[ -f "$CUSTOM_CA/server-key.pem" ]]; then
            warn "Found only one of server.pem/server-key.pem in $CUSTOM_CA — both are needed for Caddy TLS. Skipping."
        fi
    elif [[ -f "$CUSTOM_CA" ]]; then
        # Single file mode: CA trust only (no Caddy TLS certs)
        CA_CERT_PATH="$CUSTOM_CA"
    else
        err "--custom-ca path not found: $CUSTOM_CA"
        exit 1
    fi

    # Validate PEM format
    if ! head -1 "$CA_CERT_PATH" | grep -q "BEGIN"; then
        err "CA certificate does not appear to be PEM format: $CA_CERT_PATH"
        exit 1
    fi

    # If server cert/key found, require --domain and imply --caddy
    if [[ -n "$TLS_CERT_PATH" ]]; then
        if [[ -z "$CUSTOM_DOMAIN" ]]; then
            err "Server cert/key found in $CUSTOM_CA but --domain not set."
            err "Provide --domain to specify the domain name matching the certificate."
            exit 1
        fi
        USE_CADDY=true  # custom TLS certs imply --caddy
    fi
fi

if [[ -z "$MODEL_MODE" ]]; then
    err "No model mode specified. You must choose --gpu, --cpu, or --hosted."
    err ""
    err "Usage: $0 <--gpu|--cpu|--hosted> [options] [--transcript BACKEND] [--diarization BACKEND] [--translation BACKEND] [--padding BACKEND] [--mixdown BACKEND]"
    err ""
    err "ML processing modes (required):"
    err "  --gpu              NVIDIA GPU container for transcription/diarization/translation"
    err "  --cpu              In-process CPU processing (no ML container, slower)"
    err "  --hosted           Remote GPU service URL (no ML container)"
    err ""
    err "Per-service backend overrides (optional — override individual services):"
    err "  --transcript BACKEND    whisper | modal  (default: whisper for --cpu, modal for --gpu/--hosted)"
    err "  --diarization BACKEND   pyannote | modal (default: pyannote for --cpu, modal for --gpu/--hosted)"
    err "  --translation BACKEND   marian | modal | passthrough (default: marian for --cpu, modal for --gpu/--hosted)"
    err "  --padding BACKEND       pyav | modal     (default: pyav for --cpu, modal for --gpu/--hosted)"
    err "  --mixdown BACKEND       pyav | modal     (default: pyav for --cpu, modal for --gpu/--hosted)"
    err ""
    err "Local LLM (optional):"
    err "  --ollama-gpu       Local Ollama with GPU (for summarization/topics)"
    err "  --ollama-cpu       Local Ollama on CPU (for summarization/topics)"
    err "  --llm-model MODEL  Ollama model to download (default: qwen2.5:14b)"
    err "  (omit --ollama-* for external OpenAI-compatible LLM)"
    err ""
    err "Other options:"
    err "  --garage           Local S3-compatible storage (Garage)"
    err "  --caddy            Caddy reverse proxy with self-signed cert"
    err "  --domain DOMAIN    Use a real domain with Let's Encrypt HTTPS (implies --caddy)"
    err "  --custom-ca PATH   Custom CA cert (dir with ca.crt[+server.pem+server-key.pem] or single PEM file)"
    err "  --extra-ca FILE    Additional CA cert to trust (repeatable for multiple CAs)"
    err "  --password PASS    Enable password auth (admin@localhost) instead of public mode"
    err "  --build            Build backend/frontend images from source instead of pulling"
    err ""
    err "Tip: After your first run, re-run with no flags to reuse the same configuration."
    exit 1
fi

# Build profiles list — one profile per feature
# Hatchet + hatchet-worker-llm are always-on (no profile needed).
# gpu/cpu profiles only control the ML container (transcription service).
COMPOSE_PROFILES=()
[[ "$MODEL_MODE" == "gpu" ]] && COMPOSE_PROFILES+=("gpu")
[[ "$MODEL_MODE" == "cpu" ]] && COMPOSE_PROFILES+=("cpu")
[[ -n "$OLLAMA_MODE" ]] && COMPOSE_PROFILES+=("$OLLAMA_MODE")
[[ "$USE_GARAGE" == "true" ]] && COMPOSE_PROFILES+=("garage")
[[ "$USE_CADDY" == "true" ]] && COMPOSE_PROFILES+=("caddy")

# Derived flags
NEEDS_NVIDIA=false
[[ "$MODEL_MODE" == "gpu" ]] && NEEDS_NVIDIA=true
[[ "$OLLAMA_MODE" == "ollama-gpu" ]] && NEEDS_NVIDIA=true

USES_OLLAMA=false
OLLAMA_SVC=""
[[ "$OLLAMA_MODE" == "ollama-gpu" ]] && USES_OLLAMA=true && OLLAMA_SVC="ollama"
[[ "$OLLAMA_MODE" == "ollama-cpu" ]] && USES_OLLAMA=true && OLLAMA_SVC="ollama-cpu"

# Resolve effective backend per service (override wins over base mode default)
case "$MODEL_MODE" in
    gpu|hosted)
        EFF_TRANSCRIPT="${OVERRIDE_TRANSCRIPT:-modal}"
        EFF_DIARIZATION="${OVERRIDE_DIARIZATION:-modal}"
        EFF_TRANSLATION="${OVERRIDE_TRANSLATION:-modal}"
        EFF_PADDING="${OVERRIDE_PADDING:-modal}"
        EFF_MIXDOWN="${OVERRIDE_MIXDOWN:-modal}"
        ;;
    cpu)
        EFF_TRANSCRIPT="${OVERRIDE_TRANSCRIPT:-whisper}"
        EFF_DIARIZATION="${OVERRIDE_DIARIZATION:-pyannote}"
        EFF_TRANSLATION="${OVERRIDE_TRANSLATION:-marian}"
        EFF_PADDING="${OVERRIDE_PADDING:-pyav}"
        EFF_MIXDOWN="${OVERRIDE_MIXDOWN:-pyav}"
        ;;
esac

# Check if any per-service overrides were provided
HAS_OVERRIDES=false
[[ -n "$OVERRIDE_TRANSCRIPT" ]] && HAS_OVERRIDES=true
[[ -n "$OVERRIDE_DIARIZATION" ]] && HAS_OVERRIDES=true
[[ -n "$OVERRIDE_TRANSLATION" ]] && HAS_OVERRIDES=true
[[ -n "$OVERRIDE_PADDING" ]] && HAS_OVERRIDES=true
[[ -n "$OVERRIDE_MIXDOWN" ]] && HAS_OVERRIDES=true

# Human-readable mode string for display
MODE_DISPLAY="$MODEL_MODE"
[[ -n "$OLLAMA_MODE" ]] && MODE_DISPLAY="$MODEL_MODE + $OLLAMA_MODE"
if [[ "$HAS_OVERRIDES" == "true" ]]; then
    MODE_DISPLAY="$MODE_DISPLAY (overrides: transcript=$EFF_TRANSCRIPT, diarization=$EFF_DIARIZATION, translation=$EFF_TRANSLATION, padding=$EFF_PADDING, mixdown=$EFF_MIXDOWN)"
fi

# =========================================================
# LiveKit config generation helper
# =========================================================
_generate_livekit_config() {
    local lk_key lk_secret lk_url
    lk_key=$(env_get "$SERVER_ENV" "LIVEKIT_API_KEY" || true)
    lk_secret=$(env_get "$SERVER_ENV" "LIVEKIT_API_SECRET" || true)
    lk_url=$(env_get "$SERVER_ENV" "LIVEKIT_URL" || true)

    if [[ -z "$lk_key" ]] || [[ -z "$lk_secret" ]]; then
        warn "LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set — generating random credentials"
        lk_key="reflector_$(openssl rand -hex 8)"
        lk_secret="$(openssl rand -hex 32)"
        env_set "$SERVER_ENV" "LIVEKIT_API_KEY" "$lk_key"
        env_set "$SERVER_ENV" "LIVEKIT_API_SECRET" "$lk_secret"
        env_set "$SERVER_ENV" "LIVEKIT_URL" "ws://livekit-server:7880"
        ok "Generated LiveKit API credentials"
    fi

    # Set internal URL for server->livekit communication
    if ! env_has_key "$SERVER_ENV" "LIVEKIT_URL" || [[ -z "$(env_get "$SERVER_ENV" "LIVEKIT_URL" || true)" ]]; then
        env_set "$SERVER_ENV" "LIVEKIT_URL" "ws://livekit-server:7880"
    fi

    # Set public URL based on deployment mode.
    # When Caddy is enabled (HTTPS), LiveKit WebSocket is proxied through Caddy
    # at /lk-ws to avoid mixed-content blocking (browsers block ws:// on https:// pages).
    # When no Caddy, browsers connect directly to LiveKit on port 7880.
    local public_lk_url
    if [[ "$USE_CADDY" == "true" ]]; then
        if [[ -n "$CUSTOM_DOMAIN" ]]; then
            public_lk_url="wss://${CUSTOM_DOMAIN}/lk-ws"
        elif [[ -n "$PRIMARY_IP" ]]; then
            public_lk_url="wss://${PRIMARY_IP}/lk-ws"
        else
            public_lk_url="wss://localhost/lk-ws"
        fi
    else
        if [[ -n "$PRIMARY_IP" ]]; then
            public_lk_url="ws://${PRIMARY_IP}:7880"
        else
            public_lk_url="ws://localhost:7880"
        fi
    fi
    env_set "$SERVER_ENV" "LIVEKIT_PUBLIC_URL" "$public_lk_url"
    env_set "$SERVER_ENV" "DEFAULT_VIDEO_PLATFORM" "livekit"

    # LiveKit storage: always sync from transcript storage config.
    # Endpoint URL must match (changes between Caddy/no-Caddy runs).
    local ts_bucket ts_region ts_key ts_secret ts_endpoint
    ts_bucket=$(env_get "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_BUCKET_NAME" 2>/dev/null || echo "reflector-bucket")
    ts_region=$(env_get "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_REGION" 2>/dev/null || echo "us-east-1")
    ts_key=$(env_get "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_ACCESS_KEY_ID" 2>/dev/null || true)
    ts_secret=$(env_get "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_SECRET_ACCESS_KEY" 2>/dev/null || true)
    ts_endpoint=$(env_get "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_ENDPOINT_URL" 2>/dev/null || true)
    env_set "$SERVER_ENV" "LIVEKIT_STORAGE_AWS_BUCKET_NAME" "$ts_bucket"
    env_set "$SERVER_ENV" "LIVEKIT_STORAGE_AWS_REGION" "$ts_region"
    [[ -n "$ts_key" ]] && env_set "$SERVER_ENV" "LIVEKIT_STORAGE_AWS_ACCESS_KEY_ID" "$ts_key"
    [[ -n "$ts_secret" ]] && env_set "$SERVER_ENV" "LIVEKIT_STORAGE_AWS_SECRET_ACCESS_KEY" "$ts_secret"
    [[ -n "$ts_endpoint" ]] && env_set "$SERVER_ENV" "LIVEKIT_STORAGE_AWS_ENDPOINT_URL" "$ts_endpoint"
    if [[ -z "$ts_key" ]] || [[ -z "$ts_secret" ]]; then
        warn "LiveKit storage: S3 credentials not found — Track Egress recording will fail!"
        warn "Configure LIVEKIT_STORAGE_AWS_ACCESS_KEY_ID and LIVEKIT_STORAGE_AWS_SECRET_ACCESS_KEY in server/.env"
        warn "Or run with --garage to auto-configure local S3 storage"
    else
        ok "LiveKit storage: synced from transcript storage config"
    fi

    # Generate livekit.yaml
    cat > "$ROOT_DIR/livekit.yaml" << LKEOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 44200
  port_range_end: 44300
redis:
  address: redis:6379
keys:
  ${lk_key}: ${lk_secret}
webhook:
  urls:
    - http://server:1250/v1/livekit/webhook
  api_key: ${lk_key}
logging:
  level: info
room:
  empty_timeout: 300
  max_participants: 0
LKEOF
    ok "Generated livekit.yaml"

    # Generate egress.yaml (Track Egress only — no composite video)
    cat > "$ROOT_DIR/egress.yaml" << EGEOF
api_key: ${lk_key}
api_secret: ${lk_secret}
ws_url: ws://livekit-server:7880
redis:
  address: redis:6379
health_port: 7082
log_level: info
session_limits:
  file_output_max_duration: 4h
EGEOF
    ok "Generated egress.yaml"
}

# =========================================================
# Step 0: Prerequisites
# =========================================================
step_prerequisites() {
    info "Step 0: Checking prerequisites"

    # Docker
    if ! docker compose version 2>/dev/null | grep -qi compose; then
        err "Docker Compose V2 not found."
        err "Install Docker with Compose V2: https://docs.docker.com/engine/install/"
        exit 1
    fi
    if ! docker info &>/dev/null; then
        err "Docker daemon not running."
        exit 1
    fi
    ok "Docker + Compose V2 ready"

    # NVIDIA GPU check
    if [[ "$NEEDS_NVIDIA" == "true" ]]; then
        if ! command -v nvidia-smi &>/dev/null || ! nvidia-smi &>/dev/null; then
            err "NVIDIA GPU required (model=$MODEL_MODE, ollama=$OLLAMA_MODE) but nvidia-smi failed."
            err "Install NVIDIA drivers and nvidia-container-toolkit."
            exit 1
        fi
        ok "NVIDIA GPU detected"
    fi

    # Compose file
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        err "docker-compose.selfhosted.yml not found at $COMPOSE_FILE"
        err "Run this script from the repo root: ./scripts/setup-selfhosted.sh"
        exit 1
    fi

    ok "Prerequisites OK (models=$MODEL_MODE, ollama=$OLLAMA_MODE, garage=$USE_GARAGE, caddy=$USE_CADDY)"
}

# =========================================================
# Step 1: Generate secrets
# =========================================================
step_secrets() {
    info "Step 1: Generating secrets"

    # These are used in later steps — generate once, reuse
    if [[ -f "$SERVER_ENV" ]] && env_has_key "$SERVER_ENV" "SECRET_KEY"; then
        SECRET_KEY=$(env_get "$SERVER_ENV" "SECRET_KEY")
        if [[ "$SECRET_KEY" != "changeme"* ]]; then
            ok "SECRET_KEY already set"
        else
            SECRET_KEY=$(openssl rand -hex 32)
        fi
    else
        SECRET_KEY=$(openssl rand -hex 32)
    fi

    if [[ -f "$WWW_ENV" ]] && env_has_key "$WWW_ENV" "NEXTAUTH_SECRET"; then
        NEXTAUTH_SECRET=$(env_get "$WWW_ENV" "NEXTAUTH_SECRET")
        if [[ "$NEXTAUTH_SECRET" != "changeme"* ]]; then
            ok "NEXTAUTH_SECRET already set"
        else
            NEXTAUTH_SECRET=$(openssl rand -hex 32)
        fi
    else
        NEXTAUTH_SECRET=$(openssl rand -hex 32)
    fi

    # Generate admin password hash if --password was provided
    if [[ -n "$ADMIN_PASSWORD" ]]; then
        # Note: $$ escapes are required because docker-compose interprets $ in .env files
        ADMIN_PASSWORD_HASH=$(python3 -c "
import hashlib, os
salt = os.urandom(16).hex()
dk = hashlib.pbkdf2_hmac('sha256', '''${ADMIN_PASSWORD}'''.encode('utf-8'), salt.encode('utf-8'), 100000)
print(f'pbkdf2:sha256:100000\$\$' + salt + '\$\$' + dk.hex())
")
        ok "Admin password hash generated"
    fi

    ok "Secrets ready"
}

# =========================================================
# Step 1b: Custom CA certificate setup
# =========================================================
step_custom_ca() {
    if [[ "$USE_CUSTOM_CA" != "true" ]]; then
        # Clean up stale override from previous runs
        rm -f "$ROOT_DIR/docker-compose.ca.yml"
        return
    fi

    info "Configuring custom CA certificate"
    local certs_dir="$ROOT_DIR/certs"
    mkdir -p "$certs_dir"

    # Stage CA certificate (skip copy if source and dest are the same file)
    local ca_dest="$certs_dir/ca.crt"
    local src_id dst_id
    src_id=$(ls -i "$CA_CERT_PATH" 2>/dev/null | awk '{print $1}')
    dst_id=$(ls -i "$ca_dest" 2>/dev/null | awk '{print $1}')
    if [[ "$src_id" != "$dst_id" ]] || [[ -z "$dst_id" ]]; then
        cp "$CA_CERT_PATH" "$ca_dest"
    fi
    chmod 644 "$ca_dest"
    ok "CA certificate staged at certs/ca.crt"

    # Append extra CA certs (--extra-ca flags)
    for extra_ca in "${EXTRA_CA_FILES[@]+"${EXTRA_CA_FILES[@]}"}"; do
        if ! head -1 "$extra_ca" | grep -q "BEGIN"; then
            warn "Skipping $extra_ca — does not appear to be PEM format"
            continue
        fi
        echo "" >> "$ca_dest"
        cat "$extra_ca" >> "$ca_dest"
        ok "Appended extra CA: $extra_ca"
    done

    # Stage TLS cert/key if present (for Caddy)
    if [[ -n "$TLS_CERT_PATH" ]]; then
        local cert_dest="$certs_dir/server.pem"
        local key_dest="$certs_dir/server-key.pem"
        src_id=$(ls -i "$TLS_CERT_PATH" 2>/dev/null | awk '{print $1}')
        dst_id=$(ls -i "$cert_dest" 2>/dev/null | awk '{print $1}')
        if [[ "$src_id" != "$dst_id" ]] || [[ -z "$dst_id" ]]; then
            cp "$TLS_CERT_PATH" "$cert_dest"
            cp "$TLS_KEY_PATH" "$key_dest"
        fi
        chmod 644 "$cert_dest"
        chmod 600 "$key_dest"
        ok "TLS cert/key staged at certs/server.pem, certs/server-key.pem"
    fi

    # Generate docker-compose.ca.yml override
    local ca_override="$ROOT_DIR/docker-compose.ca.yml"
    cat > "$ca_override" << 'CAEOF'
# Generated by setup-selfhosted.sh — custom CA trust for backend services.
# Do not edit manually; re-run setup-selfhosted.sh with --custom-ca to regenerate.
services:
  server:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  worker:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  beat:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  hatchet-worker-llm:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  hatchet-worker-cpu:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  gpu:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  cpu:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  web:
    environment:
      NODE_EXTRA_CA_CERTS: /usr/local/share/ca-certificates/custom-ca.crt
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
CAEOF

    # If TLS cert/key present, also mount certs dir into Caddy
    if [[ -n "$TLS_CERT_PATH" ]]; then
        cat >> "$ca_override" << 'CADDYCAEOF'
  caddy:
    volumes:
      - ./certs:/etc/caddy/certs:ro
CADDYCAEOF
    fi

    ok "Generated docker-compose.ca.yml override"
}

# =========================================================
# Step 2: Generate server/.env
# =========================================================
step_server_env() {
    info "Step 2: Generating server/.env"

    if [[ -f "$SERVER_ENV" ]]; then
        ok "server/.env already exists — ensuring required vars"
    else
        cp "$ROOT_DIR/server/.env.selfhosted.example" "$SERVER_ENV"
        ok "Created server/.env from template"
    fi

    # Core infrastructure
    env_set "$SERVER_ENV" "DATABASE_URL" "postgresql+asyncpg://reflector:reflector@postgres:5432/reflector"
    env_set "$SERVER_ENV" "REDIS_HOST" "redis"
    env_set "$SERVER_ENV" "CELERY_BROKER_URL" "redis://redis:6379/1"
    env_set "$SERVER_ENV" "CELERY_RESULT_BACKEND" "redis://redis:6379/1"
    env_set "$SERVER_ENV" "CELERY_BEAT_POLL_INTERVAL" "300"
    env_set "$SERVER_ENV" "SECRET_KEY" "$SECRET_KEY"

    # Auth configuration
    if [[ -n "$ADMIN_PASSWORD" ]]; then
        env_set "$SERVER_ENV" "AUTH_BACKEND" "password"
        env_set "$SERVER_ENV" "PUBLIC_MODE" "false"
        env_set "$SERVER_ENV" "ADMIN_EMAIL" "admin@localhost"
        env_set "$SERVER_ENV" "ADMIN_PASSWORD_HASH" "$ADMIN_PASSWORD_HASH"
        ok "Password auth configured (admin@localhost)"
    else
        local current_auth_backend=""
        if env_has_key "$SERVER_ENV" "AUTH_BACKEND"; then
            current_auth_backend=$(env_get "$SERVER_ENV" "AUTH_BACKEND")
        fi
        if [[ "$current_auth_backend" != "jwt" ]]; then
            env_set "$SERVER_ENV" "AUTH_BACKEND" "none"
            env_set "$SERVER_ENV" "PUBLIC_MODE" "true"
        else
            ok "Keeping existing auth backend: $current_auth_backend"
        fi
    fi

    # Public-facing URLs
    local server_base_url
    if [[ -n "$CUSTOM_DOMAIN" ]]; then
        server_base_url="https://$CUSTOM_DOMAIN"
    elif [[ "$USE_CADDY" == "true" ]]; then
        if [[ -n "$PRIMARY_IP" ]]; then
            server_base_url="https://$PRIMARY_IP"
        else
            server_base_url="https://localhost"
        fi
    else
        if [[ -n "$PRIMARY_IP" ]]; then
            server_base_url="http://$PRIMARY_IP:1250"
        else
            server_base_url="http://localhost:1250"
        fi
    fi
    env_set "$SERVER_ENV" "BASE_URL" "$server_base_url"
    # CORS: allow the frontend origin (port 3000, not the API port)
    local cors_origin="${server_base_url}"
    if [[ "$USE_CADDY" != "true" ]]; then
        # Without Caddy, frontend is on port 3000, API on 1250
        cors_origin="${server_base_url/:1250/:3000}"
        # Safety: if substitution didn't change anything, construct explicitly
        if [[ "$cors_origin" == "$server_base_url" ]] && [[ -n "$PRIMARY_IP" ]]; then
            cors_origin="http://${PRIMARY_IP}:3000"
        fi
    fi
    env_set "$SERVER_ENV" "CORS_ORIGIN" "$cors_origin"

    # WebRTC: advertise host IP in ICE candidates so browsers can reach the server
    if [[ -n "$PRIMARY_IP" ]]; then
        env_set "$SERVER_ENV" "WEBRTC_HOST" "$PRIMARY_IP"
    fi

    # Specialized models — backend configuration per service
    env_set "$SERVER_ENV" "DIARIZATION_ENABLED" "true"

    # Resolve the URL for modal backends
    local modal_url=""
    case "$MODEL_MODE" in
        gpu)
            modal_url="http://transcription:8000"
            ;;
        hosted)
            # Remote GPU service — user provides URL
            if env_has_key "$SERVER_ENV" "TRANSCRIPT_URL"; then
                modal_url=$(env_get "$SERVER_ENV" "TRANSCRIPT_URL")
            fi
            if [[ -z "$modal_url" ]] && [[ -t 0 ]]; then
                echo ""
                info "Enter the URL of your remote GPU service (e.g. https://gpu.example.com)"
                read -rp "  GPU service URL: " modal_url
            fi
            if [[ -z "$modal_url" ]]; then
                err "GPU service URL required for --hosted mode."
                err "Set TRANSCRIPT_URL in server/.env or provide it interactively."
                exit 1
            fi
            # API key for remote service
            local gpu_api_key=""
            if env_has_key "$SERVER_ENV" "TRANSCRIPT_MODAL_API_KEY"; then
                gpu_api_key=$(env_get "$SERVER_ENV" "TRANSCRIPT_MODAL_API_KEY")
            fi
            if [[ -z "$gpu_api_key" ]] && [[ -t 0 ]]; then
                read -rp "  GPU service API key (or Enter to skip): " gpu_api_key
            fi
            if [[ -n "$gpu_api_key" ]]; then
                env_set "$SERVER_ENV" "TRANSCRIPT_MODAL_API_KEY" "$gpu_api_key"
            fi
            ;;
        cpu)
            # CPU mode: modal_url stays empty. If services are overridden to modal,
            # the user must configure the URL (TRANSCRIPT_URL etc.) in server/.env manually.
            # We intentionally do NOT read from existing env here to avoid overwriting
            # per-service URLs with a stale TRANSCRIPT_URL from a previous --gpu run.
            ;;
    esac

    # Set each service backend independently using effective backends
    # Transcript
    case "$EFF_TRANSCRIPT" in
        modal)
            env_set "$SERVER_ENV" "TRANSCRIPT_BACKEND" "modal"
            if [[ -n "$modal_url" ]]; then
                env_set "$SERVER_ENV" "TRANSCRIPT_URL" "$modal_url"
            fi
            [[ "$MODEL_MODE" == "gpu" ]] && env_set "$SERVER_ENV" "TRANSCRIPT_MODAL_API_KEY" "selfhosted"
            ;;
        whisper)
            env_set "$SERVER_ENV" "TRANSCRIPT_BACKEND" "whisper"
            ;;
    esac

    # Diarization
    case "$EFF_DIARIZATION" in
        modal)
            env_set "$SERVER_ENV" "DIARIZATION_BACKEND" "modal"
            if [[ -n "$modal_url" ]]; then
                env_set "$SERVER_ENV" "DIARIZATION_URL" "$modal_url"
            fi
            ;;
        pyannote)
            env_set "$SERVER_ENV" "DIARIZATION_BACKEND" "pyannote"
            ;;
    esac

    # Translation
    case "$EFF_TRANSLATION" in
        modal)
            env_set "$SERVER_ENV" "TRANSLATION_BACKEND" "modal"
            if [[ -n "$modal_url" ]]; then
                env_set "$SERVER_ENV" "TRANSLATE_URL" "$modal_url"
            fi
            ;;
        marian)
            env_set "$SERVER_ENV" "TRANSLATION_BACKEND" "marian"
            ;;
        passthrough)
            env_set "$SERVER_ENV" "TRANSLATION_BACKEND" "passthrough"
            ;;
    esac

    # Padding
    case "$EFF_PADDING" in
        modal)
            env_set "$SERVER_ENV" "PADDING_BACKEND" "modal"
            if [[ -n "$modal_url" ]]; then
                env_set "$SERVER_ENV" "PADDING_URL" "$modal_url"
            fi
            ;;
        pyav)
            env_set "$SERVER_ENV" "PADDING_BACKEND" "pyav"
            ;;
    esac

    # Mixdown
    case "$EFF_MIXDOWN" in
        modal)
            env_set "$SERVER_ENV" "MIXDOWN_BACKEND" "modal"
            if [[ -n "$modal_url" ]]; then
                env_set "$SERVER_ENV" "MIXDOWN_URL" "$modal_url"
            fi
            ;;
        pyav)
            env_set "$SERVER_ENV" "MIXDOWN_BACKEND" "pyav"
            ;;
    esac

    # Warn about modal overrides in CPU mode that need URL configuration
    if [[ "$MODEL_MODE" == "cpu" ]] && [[ -z "$modal_url" ]]; then
        local needs_url=false
        [[ "$EFF_TRANSCRIPT" == "modal" ]] && needs_url=true
        [[ "$EFF_DIARIZATION" == "modal" ]] && needs_url=true
        [[ "$EFF_TRANSLATION" == "modal" ]] && needs_url=true
        [[ "$EFF_PADDING" == "modal" ]] && needs_url=true
        [[ "$EFF_MIXDOWN" == "modal" ]] && needs_url=true
        if [[ "$needs_url" == "true" ]]; then
            warn "One or more services are set to 'modal' but no service URL is configured."
            warn "Set TRANSCRIPT_URL (and optionally TRANSCRIPT_MODAL_API_KEY) in server/.env"
            warn "to point to your GPU service, then re-run this script."
        fi
    fi

    ok "ML backends: transcript=$EFF_TRANSCRIPT, diarization=$EFF_DIARIZATION, translation=$EFF_TRANSLATION, padding=$EFF_PADDING, mixdown=$EFF_MIXDOWN"

    # HuggingFace token for gated models (pyannote diarization)
    # Needed when: GPU container is running (MODEL_MODE=gpu), or diarization uses pyannote in-process
    # Not needed when: all modal services point to a remote hosted URL with its own auth
    if [[ "$MODEL_MODE" == "gpu" ]] || [[ "$EFF_DIARIZATION" == "pyannote" ]]; then
        local root_env="$ROOT_DIR/.env"
        local current_hf_token="${HF_TOKEN:-}"
        if [[ -f "$root_env" ]] && env_has_key "$root_env" "HF_TOKEN"; then
            current_hf_token=$(env_get "$root_env" "HF_TOKEN")
        fi
        if [[ -z "$current_hf_token" ]]; then
            echo ""
            warn "HF_TOKEN not set. Diarization will use a public model fallback."
            warn "For best results, get a token at https://huggingface.co/settings/tokens"
            warn "and accept pyannote licenses at https://huggingface.co/pyannote/speaker-diarization-3.1"
            if [[ -t 0 ]]; then
                read -rp "  HuggingFace token (or press Enter to skip): " current_hf_token
            fi
        fi
        if [[ -n "$current_hf_token" ]]; then
            touch "$root_env"
            env_set "$root_env" "HF_TOKEN" "$current_hf_token"
            export HF_TOKEN="$current_hf_token"
            # When diarization runs in-process (pyannote), server process needs HF_TOKEN directly
            if [[ "$EFF_DIARIZATION" == "pyannote" ]]; then
                env_set "$SERVER_ENV" "HF_TOKEN" "$current_hf_token"
            fi
            ok "HF_TOKEN configured"
        else
            touch "$root_env"
            env_set "$root_env" "HF_TOKEN" ""
            ok "HF_TOKEN skipped (using public model fallback)"
        fi
    fi

    # LLM configuration
    if [[ "$USES_OLLAMA" == "true" ]]; then
        local llm_host="$OLLAMA_SVC"
        env_set "$SERVER_ENV" "LLM_URL" "http://${llm_host}:11435/v1"
        env_set "$SERVER_ENV" "LLM_MODEL" "$OLLAMA_MODEL"
        env_set "$SERVER_ENV" "LLM_API_KEY" "not-needed"
        ok "LLM configured for local Ollama ($llm_host, model=$OLLAMA_MODEL)"
    else
        # Check if user already configured LLM
        local current_llm_url=""
        if env_has_key "$SERVER_ENV" "LLM_URL"; then
            current_llm_url=$(env_get "$SERVER_ENV" "LLM_URL")
        fi
        if [[ -z "$current_llm_url" ]]; then
            warn "LLM not configured. Summarization and topic detection will NOT work."
            warn "Edit server/.env and set LLM_URL, LLM_API_KEY, LLM_MODEL"
            warn "Example: LLM_URL=https://api.openai.com/v1  LLM_MODEL=gpt-4o-mini"
        else
            ok "LLM already configured: $current_llm_url"
        fi
    fi

    # Increase file processing timeouts for CPU backends (default 600s is too short for long audio on CPU)
    if [[ "$EFF_TRANSCRIPT" == "whisper" ]]; then
        env_set "$SERVER_ENV" "TRANSCRIPT_FILE_TIMEOUT" "3600"
    fi
    if [[ "$EFF_DIARIZATION" == "pyannote" ]]; then
        env_set "$SERVER_ENV" "DIARIZATION_FILE_TIMEOUT" "3600"
    fi
    if [[ "$EFF_TRANSCRIPT" == "whisper" ]] || [[ "$EFF_DIARIZATION" == "pyannote" ]]; then
        ok "CPU backend(s) detected — file processing timeouts set to 3600s (1 hour)"
    fi

    # Hatchet is always required (file, live, and multitrack pipelines all use it)
    env_set "$SERVER_ENV" "HATCHET_CLIENT_SERVER_URL" "http://hatchet:8888"
    env_set "$SERVER_ENV" "HATCHET_CLIENT_HOST_PORT" "hatchet:7077"
    env_set "$SERVER_ENV" "HATCHET_CLIENT_TLS_STRATEGY" "none"
    ok "Hatchet connectivity configured (workflow engine for processing pipelines)"

    # BIND_HOST controls whether server/web ports are exposed on all interfaces
    local root_env="$ROOT_DIR/.env"
    touch "$root_env"
    if [[ "$USE_CADDY" == "true" ]]; then
        # With Caddy, services stay on localhost (Caddy is the public entry point)
        env_set "$root_env" "BIND_HOST" "127.0.0.1"
    elif [[ -n "$PRIMARY_IP" ]]; then
        # Without Caddy + detected IP, expose on all interfaces for direct access
        env_set "$root_env" "BIND_HOST" "0.0.0.0"
        ok "BIND_HOST=0.0.0.0 (ports exposed for direct access)"
    fi

    ok "server/.env ready"
}

# =========================================================
# Step 3: Generate www/.env
# =========================================================
step_www_env() {
    info "Step 3: Generating www/.env"

    if [[ -f "$WWW_ENV" ]]; then
        ok "www/.env already exists — ensuring required vars"
    else
        cp "$ROOT_DIR/www/.env.selfhosted.example" "$WWW_ENV"
        ok "Created www/.env from template"
    fi

    # Public-facing URL for frontend
    local base_url
    if [[ -n "$CUSTOM_DOMAIN" ]]; then
        base_url="https://$CUSTOM_DOMAIN"
    elif [[ "$USE_CADDY" == "true" ]]; then
        if [[ -n "$PRIMARY_IP" ]]; then
            base_url="https://$PRIMARY_IP"
        else
            base_url="https://localhost"
        fi
    else
        # No Caddy — clients connect directly to services on their ports.
        if [[ -n "$PRIMARY_IP" ]]; then
            base_url="http://$PRIMARY_IP:3000"
        else
            base_url="http://localhost:3000"
        fi
    fi

    # API_URL: with Caddy, same origin (443 proxies both); without Caddy, API is on port 1250
    local api_url="$base_url"
    if [[ "$USE_CADDY" != "true" ]]; then
        api_url="${base_url/:3000/:1250}"
        # fallback if no port substitution happened (e.g. localhost without port)
        [[ "$api_url" == "$base_url" ]] && api_url="${base_url}:1250"
    fi

    env_set "$WWW_ENV" "SITE_URL" "$base_url"
    env_set "$WWW_ENV" "NEXTAUTH_URL" "$base_url"
    env_set "$WWW_ENV" "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET"
    env_set "$WWW_ENV" "API_URL" "$api_url"
    env_set "$WWW_ENV" "WEBSOCKET_URL" "auto"
    env_set "$WWW_ENV" "SERVER_API_URL" "http://server:1250"
    env_set "$WWW_ENV" "KV_URL" "redis://redis:6379"

    # Auth configuration
    if [[ -n "$ADMIN_PASSWORD" ]]; then
        env_set "$WWW_ENV" "FEATURE_REQUIRE_LOGIN" "true"
        env_set "$WWW_ENV" "AUTH_PROVIDER" "credentials"
        ok "Frontend configured for password auth"
    else
        local current_auth_provider=""
        if env_has_key "$WWW_ENV" "AUTH_PROVIDER"; then
            current_auth_provider=$(env_get "$WWW_ENV" "AUTH_PROVIDER")
        fi
        if [[ "$current_auth_provider" != "authentik" ]]; then
            env_set "$WWW_ENV" "FEATURE_REQUIRE_LOGIN" "false"
        else
            ok "Keeping existing auth provider: $current_auth_provider"
        fi
    fi

    # Enable rooms if any video platform is configured in server/.env
    local _daily_key="" _whereby_key="" _livekit_key=""
    if env_has_key "$SERVER_ENV" "DAILY_API_KEY"; then
        _daily_key=$(env_get "$SERVER_ENV" "DAILY_API_KEY")
    fi
    if env_has_key "$SERVER_ENV" "WHEREBY_API_KEY"; then
        _whereby_key=$(env_get "$SERVER_ENV" "WHEREBY_API_KEY")
    fi
    if env_has_key "$SERVER_ENV" "LIVEKIT_API_KEY"; then
        _livekit_key=$(env_get "$SERVER_ENV" "LIVEKIT_API_KEY")
    fi
    if [[ -n "$_daily_key" ]] || [[ -n "$_whereby_key" ]] || [[ -n "$_livekit_key" ]]; then
        env_set "$WWW_ENV" "FEATURE_ROOMS" "true"
        ok "Rooms feature enabled (video platform configured)"
    fi

    ok "www/.env ready (URL=$base_url)"
}

# =========================================================
# Step 4: Storage setup
# =========================================================
step_storage() {
    info "Step 4: Storage setup"

    if [[ "$USE_GARAGE" == "true" ]]; then
        step_garage
    else
        step_external_s3
    fi
}

step_garage() {
    info "Configuring Garage (local S3)"

    # Generate garage.toml from template
    local garage_toml="$ROOT_DIR/scripts/garage.toml"
    local garage_runtime="$ROOT_DIR/data/garage.toml"
    mkdir -p "$ROOT_DIR/data"

    if [[ -d "$garage_runtime" ]]; then
        rm -rf "$garage_runtime"
    fi
    if [[ ! -f "$garage_runtime" ]]; then
        local rpc_secret
        rpc_secret=$(openssl rand -hex 32)
        sed "s|__GARAGE_RPC_SECRET__|${rpc_secret}|" "$garage_toml" > "$garage_runtime"
        ok "Generated data/garage.toml"
    else
        ok "data/garage.toml already exists"
    fi

    # Start garage container only
    compose_garage_cmd up -d garage

    # Wait for admin API (port 3903 exposed to host for health checks)
    local garage_ready=false
    for i in $(seq 1 30); do
        if curl -sf http://localhost:3903/metrics > /dev/null 2>&1; then
            garage_ready=true
            break
        fi
        echo -ne "\r  Waiting for Garage admin API... ($i/30)"
        sleep 2
    done
    echo ""
    if [[ "$garage_ready" != "true" ]]; then
        err "Garage not responding. Check: docker compose logs garage"
        exit 1
    fi

    # Layout
    local node_id
    node_id=$(compose_garage_cmd exec -T garage /garage node id -q 2>/dev/null | tr -d '[:space:]')
    local layout_status
    layout_status=$(compose_garage_cmd exec -T garage /garage layout show 2>&1 || true)
    if echo "$layout_status" | grep -q "No nodes"; then
        compose_garage_cmd exec -T garage /garage layout assign "$node_id" -c 1G -z dc1
        compose_garage_cmd exec -T garage /garage layout apply --version 1
    fi

    # Bucket
    if ! compose_garage_cmd exec -T garage /garage bucket info reflector-media &>/dev/null; then
        compose_garage_cmd exec -T garage /garage bucket create reflector-media
    fi

    # Key
    local created_key=false
    if compose_garage_cmd exec -T garage /garage key info reflector &>/dev/null; then
        ok "Key 'reflector' already exists"
    else
        KEY_OUTPUT=$(compose_garage_cmd exec -T garage /garage key create reflector)
        created_key=true
    fi

    # Permissions
    compose_garage_cmd exec -T garage /garage bucket allow reflector-media --read --write --key reflector

    # Write S3 credentials to server/.env
    env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_BACKEND" "aws"
    # Endpoint URL: use public IP when no Caddy so presigned URLs work in the browser.
    # With Caddy, internal hostname is fine (Caddy proxies or browser never sees presigned URLs directly).
    if [[ "$USE_CADDY" != "true" ]] && [[ -n "$PRIMARY_IP" ]]; then
        env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_ENDPOINT_URL" "http://${PRIMARY_IP}:3900"
    else
        env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_ENDPOINT_URL" "http://garage:3900"
    fi
    env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_BUCKET_NAME" "reflector-media"
    env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_REGION" "garage"
    if [[ "$created_key" == "true" ]]; then
        local key_id key_secret
        key_id=$(echo "$KEY_OUTPUT" | grep -i "key id" | awk '{print $NF}')
        key_secret=$(echo "$KEY_OUTPUT" | grep -i "secret key" | awk '{print $NF}')
        env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_ACCESS_KEY_ID" "$key_id"
        env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_SECRET_ACCESS_KEY" "$key_secret"
    fi

    ok "Garage storage ready"
}

step_external_s3() {
    info "Checking external S3 configuration"

    env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_BACKEND" "aws"

    local s3_vars=("TRANSCRIPT_STORAGE_AWS_ACCESS_KEY_ID" "TRANSCRIPT_STORAGE_AWS_SECRET_ACCESS_KEY" "TRANSCRIPT_STORAGE_AWS_BUCKET_NAME" "TRANSCRIPT_STORAGE_AWS_REGION")
    local missing=()

    for var in "${s3_vars[@]}"; do
        if ! env_has_key "$SERVER_ENV" "$var" || [[ -z "$(env_get "$SERVER_ENV" "$var")" ]]; then
            missing+=("$var")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        warn "S3 storage is REQUIRED. The following vars are missing in server/.env:"
        for var in "${missing[@]}"; do
            warn "  $var"
        done
        echo ""
        info "Enter S3 credentials (or press Ctrl+C to abort and edit server/.env manually):"
        echo ""

        for var in "${missing[@]}"; do
            local prompt_label
            case "$var" in
                *ACCESS_KEY_ID)      prompt_label="Access Key ID" ;;
                *SECRET_ACCESS_KEY)  prompt_label="Secret Access Key" ;;
                *BUCKET_NAME)        prompt_label="Bucket Name" ;;
                *REGION)             prompt_label="Region (e.g. us-east-1)" ;;
            esac
            local value=""
            while [[ -z "$value" ]]; do
                read -rp "  $prompt_label: " value
            done
            env_set "$SERVER_ENV" "$var" "$value"
        done

        # Optional: endpoint URL for non-AWS S3
        echo ""
        read -rp "  S3 Endpoint URL (leave empty for AWS, or enter for MinIO/etc.): " endpoint_url
        if [[ -n "$endpoint_url" ]]; then
            env_set "$SERVER_ENV" "TRANSCRIPT_STORAGE_AWS_ENDPOINT_URL" "$endpoint_url"
        fi
    fi

    ok "S3 storage configured"
}

# =========================================================
# Step 5: Caddyfile
# =========================================================
step_caddyfile() {
    if [[ "$USE_CADDY" != "true" ]]; then
        return
    fi

    info "Step 5: Caddyfile setup"

    local caddyfile="$ROOT_DIR/Caddyfile"
    if [[ -d "$caddyfile" ]]; then
        rm -rf "$caddyfile"
    fi

    # LiveKit reverse proxy snippet (inserted into Caddyfile when --livekit is active)
    # LiveKit reverse proxy snippet (inserted into Caddyfile when --livekit is active).
    # Strips /lk-ws prefix so LiveKit server sees requests at its root /.
    local lk_proxy_block=""
    if [[ "$LIVEKIT_DETECTED" == "true" ]]; then
        lk_proxy_block="
    handle_path /lk-ws/* {
        reverse_proxy livekit-server:7880
    }
    handle_path /lk-ws {
        reverse_proxy livekit-server:7880
    }"
    fi

    local hatchet_proxy_block=""

    if [[ -n "$TLS_CERT_PATH" ]] && [[ -n "$CUSTOM_DOMAIN" ]]; then
        # Custom domain with user-provided TLS certificate (from --custom-ca directory)
        cat > "$caddyfile" << CADDYEOF
# Generated by setup-selfhosted.sh — Custom TLS cert for $CUSTOM_DOMAIN
$CUSTOM_DOMAIN {
    tls /etc/caddy/certs/server.pem /etc/caddy/certs/server-key.pem
    handle /v1/* {
        reverse_proxy server:1250
    }
    handle /health {
        reverse_proxy server:1250
    }${lk_proxy_block}${hatchet_proxy_block}
    handle {
        reverse_proxy web:3000
    }
}
CADDYEOF
        ok "Created Caddyfile for $CUSTOM_DOMAIN (custom TLS certificate)"
    elif [[ -n "$CUSTOM_DOMAIN" ]]; then
        # Real domain: Caddy auto-provisions Let's Encrypt certificate
        cat > "$caddyfile" << CADDYEOF
# Generated by setup-selfhosted.sh — Let's Encrypt HTTPS for $CUSTOM_DOMAIN
$CUSTOM_DOMAIN {
    handle /v1/* {
        reverse_proxy server:1250
    }
    handle /health {
        reverse_proxy server:1250
    }${lk_proxy_block}${hatchet_proxy_block}
    handle {
        reverse_proxy web:3000
    }
}
CADDYEOF
        ok "Created Caddyfile for $CUSTOM_DOMAIN (Let's Encrypt auto-HTTPS)"
    elif [[ -n "$PRIMARY_IP" ]]; then
        # No domain, IP only: catch-all :443 with self-signed cert
        # on_demand generates certs dynamically for any hostname/IP on first request
        cat > "$caddyfile" << CADDYEOF
# Generated by setup-selfhosted.sh — self-signed cert for IP access
:443 {
    tls internal {
        on_demand
    }
    handle /v1/* {
        reverse_proxy server:1250
    }
    handle /health {
        reverse_proxy server:1250
    }${lk_proxy_block}${hatchet_proxy_block}
    handle {
        reverse_proxy web:3000
    }
}
CADDYEOF
        ok "Created Caddyfile for $PRIMARY_IP (catch-all :443 with self-signed cert)"
    elif [[ ! -f "$caddyfile" ]]; then
        cp "$ROOT_DIR/Caddyfile.selfhosted.example" "$caddyfile"
        ok "Created Caddyfile from template"
    else
        ok "Caddyfile already exists"
    fi

    if [[ "$DAILY_DETECTED" == "true" ]] || [[ "$LIVEKIT_DETECTED" == "true" ]]; then
        ok "Hatchet dashboard available at port 8888"
    fi
}

# =========================================================
# Step 6: Start services
# =========================================================
step_services() {
    info "Step 6: Starting Docker services"

    # Build GPU image from source (only for --gpu mode)
    if [[ "$MODEL_MODE" == "gpu" ]]; then
        info "Building gpu image (first build downloads ML models, may take a while)..."
        compose_cmd build gpu
        ok "gpu image built"
    fi

    # Build or pull backend and frontend images
    if [[ "$BUILD_IMAGES" == "true" ]]; then
        info "Building backend image from source (server, worker, beat)..."
        compose_cmd build server worker beat
        ok "Backend image built"
        info "Building frontend image from source..."
        compose_cmd build web
        ok "Frontend image built"
    else
        info "Pulling latest backend and frontend images..."
        compose_cmd pull server web || warn "Pull failed — using cached images"
    fi

    # Hatchet is always needed (all processing pipelines use it)
    local NEEDS_HATCHET=true

    # Build hatchet workers if Hatchet is needed (same backend image)
    if [[ "$NEEDS_HATCHET" == "true" ]] && [[ "$BUILD_IMAGES" == "true" ]]; then
        info "Building Hatchet worker images..."
        if [[ "$DAILY_DETECTED" == "true" ]]; then
            compose_cmd build hatchet-worker-cpu hatchet-worker-llm
        else
            compose_cmd build hatchet-worker-llm
        fi
        ok "Hatchet worker images built"
    fi

    # Ensure hatchet database exists before starting hatchet (init-hatchet-db.sql only runs on fresh postgres volumes)
    if [[ "$NEEDS_HATCHET" == "true" ]]; then
        info "Ensuring postgres is running for Hatchet database setup..."
        compose_cmd up -d postgres
        local pg_ready=false
        for i in $(seq 1 30); do
            if compose_cmd exec -T postgres pg_isready -U reflector > /dev/null 2>&1; then
                pg_ready=true
                break
            fi
            sleep 2
        done
        if [[ "$pg_ready" == "true" ]]; then
            compose_cmd exec -T postgres psql -U reflector -tc \
                "SELECT 1 FROM pg_database WHERE datname = 'hatchet'" 2>/dev/null \
                | grep -q 1 \
                || compose_cmd exec -T postgres psql -U reflector -c "CREATE DATABASE hatchet" 2>/dev/null \
                || true
            ok "Hatchet database ready"
        else
            warn "Postgres not ready — hatchet database may need to be created manually"
        fi
    fi

    # Start all services
    compose_cmd up -d
    ok "Containers started"

    # Quick sanity check
    sleep 3
    local exited
    exited=$(compose_cmd ps -a --format '{{.Name}} {{.Status}}' 2>/dev/null \
        | grep -i 'exit' || true)
    if [[ -n "$exited" ]]; then
        warn "Some containers exited immediately:"
        echo "$exited" | while read -r line; do warn "  $line"; done
        dump_diagnostics
    fi
}

# =========================================================
# Step 7: Health checks
# =========================================================
step_health() {
    info "Step 7: Health checks"

    # Specialized model service (only for --gpu mode)
    if [[ "$MODEL_MODE" == "gpu" ]]; then
        info "Waiting for gpu service (first start downloads ~1GB of models)..."
        local model_ok=false
        for i in $(seq 1 120); do
            if curl -sf http://localhost:8000/docs > /dev/null 2>&1; then
                model_ok=true
                break
            fi
            echo -ne "\r  Waiting for gpu service... ($i/120)"
            sleep 5
        done
        echo ""
        if [[ "$model_ok" == "true" ]]; then
            ok "gpu service healthy (transcription + diarization)"
        else
            warn "gpu service not ready yet — it will keep loading in the background"
            warn "Check with: docker compose -f docker-compose.selfhosted.yml logs gpu"
        fi
    elif [[ "$MODEL_MODE" == "cpu" ]]; then
        ok "CPU mode — in-process backends run on server/worker (transcript=$EFF_TRANSCRIPT, diarization=$EFF_DIARIZATION, translation=$EFF_TRANSLATION, padding=$EFF_PADDING, mixdown=$EFF_MIXDOWN)"
    elif [[ "$MODEL_MODE" == "hosted" ]]; then
        ok "Hosted mode — ML processing via remote GPU service (transcript=$EFF_TRANSCRIPT, diarization=$EFF_DIARIZATION, translation=$EFF_TRANSLATION, padding=$EFF_PADDING, mixdown=$EFF_MIXDOWN)"
    fi

    # Ollama (if applicable)
    if [[ "$USES_OLLAMA" == "true" ]]; then
        info "Waiting for Ollama service..."
        local ollama_ok=false
        for i in $(seq 1 60); do
            if curl -sf http://localhost:11435/api/tags > /dev/null 2>&1; then
                ollama_ok=true
                break
            fi
            echo -ne "\r  Waiting for Ollama... ($i/60)"
            sleep 3
        done
        echo ""
        if [[ "$ollama_ok" == "true" ]]; then
            ok "Ollama service healthy"

            # Pull model if not present
            if compose_cmd exec -T "$OLLAMA_SVC" ollama list 2>/dev/null | awk '{print $1}' | grep -qxF "$OLLAMA_MODEL"; then
                ok "Model $OLLAMA_MODEL already pulled"
            else
                info "Pulling model $OLLAMA_MODEL (this may take a while)..."
                compose_cmd exec -T "$OLLAMA_SVC" ollama pull "$OLLAMA_MODEL"
                ok "Model $OLLAMA_MODEL pulled"
            fi
        else
            warn "Ollama not ready yet. Check: docker compose logs $OLLAMA_SVC"
        fi
    fi

    # Server API
    info "Waiting for Server API (first run includes database migrations)..."
    local server_ok=false
    for i in $(seq 1 90); do
        local svc_status
        svc_status=$(compose_cmd ps server --format '{{.Status}}' 2>/dev/null || true)
        if [[ -z "$svc_status" ]] || echo "$svc_status" | grep -qi 'exit'; then
            echo ""
            err "Server container exited unexpectedly"
            dump_diagnostics server
            exit 1
        fi
        if curl -sf http://localhost:1250/health > /dev/null 2>&1; then
            server_ok=true
            break
        fi
        echo -ne "\r  Waiting for Server API... ($i/90)"
        sleep 5
    done
    echo ""
    if [[ "$server_ok" == "true" ]]; then
        ok "Server API healthy"
    else
        err "Server API not ready after ~7 minutes"
        dump_diagnostics server
        exit 1
    fi

    # Frontend
    info "Waiting for Frontend..."
    local web_ok=false
    for i in $(seq 1 30); do
        if curl -sf http://localhost:3000 > /dev/null 2>&1; then
            web_ok=true
            break
        fi
        echo -ne "\r  Waiting for Frontend... ($i/30)"
        sleep 3
    done
    echo ""
    if [[ "$web_ok" == "true" ]]; then
        ok "Frontend healthy"
    else
        warn "Frontend not responding. Check: docker compose logs web"
    fi

    # Caddy
    if [[ "$USE_CADDY" == "true" ]]; then
        sleep 2
        if curl -sfk "https://localhost" > /dev/null 2>&1; then
            ok "Caddy proxy healthy"
        else
            warn "Caddy proxy not responding. Check: docker compose logs caddy"
        fi
    fi

    # Hatchet (always-on)
    info "Waiting for Hatchet workflow engine..."
    local hatchet_ok=false
    for i in $(seq 1 60); do
        if compose_cmd exec -T hatchet curl -sf http://localhost:8888/api/live > /dev/null 2>&1; then
            hatchet_ok=true
            break
        fi
        echo -ne "\r  Waiting for Hatchet... ($i/60)"
        sleep 3
    done
    echo ""
    if [[ "$hatchet_ok" == "true" ]]; then
        ok "Hatchet workflow engine healthy"
    else
        warn "Hatchet not ready yet. Check: docker compose logs hatchet"
    fi

    # LLM warning for non-Ollama modes
    if [[ "$USES_OLLAMA" == "false" ]]; then
        local llm_url=""
        if env_has_key "$SERVER_ENV" "LLM_URL"; then
            llm_url=$(env_get "$SERVER_ENV" "LLM_URL")
        fi
        if [[ -z "$llm_url" ]]; then
            echo ""
            warn "LLM is not configured. Transcription will work, but:"
            warn "  - Summaries will NOT be generated"
            warn "  - Topics will NOT be detected"
            warn "  - Titles will NOT be auto-generated"
            warn "Configure in server/.env: LLM_URL, LLM_API_KEY, LLM_MODEL"
        fi
    fi
}

# =========================================================
# Step 8: Hatchet token generation (gpu/cpu/Daily.co)
# =========================================================
step_hatchet_token() {
    # Hatchet is always required — no gating needed

    # Skip if token already set
    if env_has_key "$SERVER_ENV" "HATCHET_CLIENT_TOKEN" && [[ -n "$(env_get "$SERVER_ENV" "HATCHET_CLIENT_TOKEN")" ]]; then
        ok "HATCHET_CLIENT_TOKEN already set — skipping generation"
        return
    fi

    info "Step 8: Generating Hatchet API token"

    # Wait for hatchet to be healthy
    local hatchet_ok=false
    for i in $(seq 1 60); do
        if compose_cmd exec -T hatchet curl -sf http://localhost:8888/api/live > /dev/null 2>&1; then
            hatchet_ok=true
            break
        fi
        echo -ne "\r  Waiting for Hatchet API... ($i/60)"
        sleep 3
    done
    echo ""

    if [[ "$hatchet_ok" != "true" ]]; then
        err "Hatchet not responding — cannot generate token"
        err "Check: docker compose logs hatchet"
        return
    fi

    # Get tenant ID from hatchet database
    local tenant_id
    tenant_id=$(compose_cmd exec -T postgres psql -U reflector -d hatchet -t -c \
        "SELECT id FROM \"Tenant\" WHERE slug = 'default';" 2>/dev/null | tr -d ' \n')

    if [[ -z "$tenant_id" ]]; then
        err "Could not find default tenant in Hatchet database"
        err "Hatchet may still be initializing. Try re-running the script."
        return
    fi

    # Generate token via hatchet-admin
    local token
    token=$(compose_cmd exec -T hatchet /hatchet-admin token create \
        --config /config --tenant-id "$tenant_id" 2>/dev/null | tr -d '\n')

    if [[ -z "$token" ]]; then
        err "Failed to generate Hatchet token"
        err "Try generating manually: see server/README.md"
        return
    fi

    env_set "$SERVER_ENV" "HATCHET_CLIENT_TOKEN" "$token"
    ok "HATCHET_CLIENT_TOKEN generated and saved to server/.env"

    # Restart services that need the token
    info "Restarting services with new Hatchet token..."
    local restart_services="server worker hatchet-worker-llm"
    [[ "$DAILY_DETECTED" == "true" ]] && restart_services="$restart_services hatchet-worker-cpu"
    compose_cmd restart $restart_services
    ok "Services restarted with Hatchet token"
}

# =========================================================
# Main
# =========================================================
main() {
    echo ""
    echo "=========================================="
    echo " Reflector — Self-Hosted Production Setup"
    echo "=========================================="
    echo ""
    echo "  Models:  $MODEL_MODE"
    if [[ "$HAS_OVERRIDES" == "true" ]]; then
        echo "           transcript=$EFF_TRANSCRIPT, diarization=$EFF_DIARIZATION"
        echo "           translation=$EFF_TRANSLATION, padding=$EFF_PADDING, mixdown=$EFF_MIXDOWN"
    fi
    echo "  LLM:     ${OLLAMA_MODE:-external}"
    echo "  Garage:  $USE_GARAGE"
    echo "  Caddy:   $USE_CADDY"
    [[ -n "$CUSTOM_DOMAIN" ]] && echo "  Domain:  $CUSTOM_DOMAIN"
    [[ "$USE_CUSTOM_CA" == "true" ]] && echo "  CA:      Custom ($CUSTOM_CA)"
    [[ -n "$TLS_CERT_PATH" ]] && echo "  TLS:     Custom cert (from $CUSTOM_CA)"
    [[ "$BUILD_IMAGES" == "true" ]] && echo "  Build:   from source"
    echo ""

    # Detect primary IP (--ip overrides auto-detection)
    if [[ -n "$CUSTOM_IP" ]]; then
        PRIMARY_IP="$CUSTOM_IP"
        ok "Using provided IP: $PRIMARY_IP"
    else
        PRIMARY_IP=""
        if [[ "$OS" == "Linux" ]]; then
            PRIMARY_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
            if [[ "$PRIMARY_IP" == "127."* ]] || [[ -z "$PRIMARY_IP" ]]; then
                PRIMARY_IP=$(ip -4 route get 1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p' || true)
            fi
        elif [[ "$OS" == "Darwin" ]]; then
            PRIMARY_IP=$(detect_lan_ip)
        fi
    fi

    # Touch env files so compose doesn't complain about missing env_file
    mkdir -p "$ROOT_DIR/data"
    touch "$SERVER_ENV" "$WWW_ENV"

    # Ensure garage.toml exists if garage profile is active (compose needs it for volume mount)
    if [[ "$USE_GARAGE" == "true" ]]; then
        local garage_runtime="$ROOT_DIR/data/garage.toml"
        if [[ ! -f "$garage_runtime" ]]; then
            local rpc_secret
            rpc_secret=$(openssl rand -hex 32)
            sed "s|__GARAGE_RPC_SECRET__|${rpc_secret}|" "$ROOT_DIR/scripts/garage.toml" > "$garage_runtime"
        fi
    fi

    step_prerequisites
    echo ""
    step_secrets
    echo ""
    step_custom_ca
    echo ""
    step_server_env
    echo ""

    # Auto-detect video platforms from server/.env (after step_server_env so file exists)
    DAILY_DETECTED=false
    WHEREBY_DETECTED=false
    LIVEKIT_DETECTED=false
    if env_has_key "$SERVER_ENV" "DAILY_API_KEY" && [[ -n "$(env_get "$SERVER_ENV" "DAILY_API_KEY")" ]]; then
        DAILY_DETECTED=true
    fi
    if env_has_key "$SERVER_ENV" "WHEREBY_API_KEY" && [[ -n "$(env_get "$SERVER_ENV" "WHEREBY_API_KEY")" ]]; then
        WHEREBY_DETECTED=true
    fi
    # LiveKit: enabled via --livekit flag OR pre-existing LIVEKIT_API_KEY in env
    if [[ "$USE_LIVEKIT" == "true" ]]; then
        LIVEKIT_DETECTED=true
    elif env_has_key "$SERVER_ENV" "LIVEKIT_API_KEY" && [[ -n "$(env_get "$SERVER_ENV" "LIVEKIT_API_KEY")" ]]; then
        LIVEKIT_DETECTED=true
    fi
    ANY_PLATFORM_DETECTED=false
    [[ "$DAILY_DETECTED" == "true" || "$WHEREBY_DETECTED" == "true" || "$LIVEKIT_DETECTED" == "true" ]] && ANY_PLATFORM_DETECTED=true

    # Conditional profile activation for Daily.co
    if [[ "$DAILY_DETECTED" == "true" ]]; then
        COMPOSE_PROFILES+=("dailyco")
        ok "Daily.co detected — enabling Hatchet workflow services"
    fi

    # Conditional profile activation for LiveKit
    if [[ "$LIVEKIT_DETECTED" == "true" ]]; then
        COMPOSE_PROFILES+=("livekit")
        _generate_livekit_config
        ok "LiveKit enabled — livekit-server + livekit-egress"
    fi

    # Generate .env.hatchet for hatchet dashboard config (always needed)
    local hatchet_server_url hatchet_cookie_domain
    if [[ -n "$CUSTOM_DOMAIN" ]]; then
        hatchet_server_url="https://${CUSTOM_DOMAIN}:8888"
        hatchet_cookie_domain="$CUSTOM_DOMAIN"
    elif [[ -n "$PRIMARY_IP" ]]; then
        hatchet_server_url="http://${PRIMARY_IP}:8888"
        hatchet_cookie_domain="$PRIMARY_IP"
    else
        hatchet_server_url="http://localhost:8888"
        hatchet_cookie_domain="localhost"
    fi
    cat > "$ROOT_DIR/.env.hatchet" << EOF
SERVER_URL=$hatchet_server_url
SERVER_AUTH_COOKIE_DOMAIN=$hatchet_cookie_domain
EOF
    ok "Generated .env.hatchet (dashboard URL=$hatchet_server_url)"

    step_www_env
    echo ""
    step_storage
    echo ""
    step_caddyfile
    echo ""
    step_services
    echo ""
    step_health
    echo ""
    step_hatchet_token

    echo ""
    echo "=========================================="
    echo -e " ${GREEN}Reflector is running!${NC}"
    echo "=========================================="
    echo ""
    if [[ "$USE_CADDY" == "true" ]]; then
        if [[ -n "$CUSTOM_DOMAIN" ]]; then
            echo "  App:   https://$CUSTOM_DOMAIN"
            echo "  API:   https://$CUSTOM_DOMAIN/v1/"
        elif [[ -n "$PRIMARY_IP" ]]; then
            echo "  App:   https://$PRIMARY_IP  (accept self-signed cert in browser)"
            echo "  API:   https://$PRIMARY_IP/v1/"
            echo "  Local: https://localhost"
        else
            echo "  App:   https://localhost  (accept self-signed cert in browser)"
            echo "  API:   https://localhost/v1/"
        fi
    elif [[ -n "$PRIMARY_IP" ]]; then
        echo "  App:   http://$PRIMARY_IP:3000"
        echo "  API:   http://$PRIMARY_IP:1250"
    else
        echo "  App:   http://localhost:3000"
        echo "  API:   http://localhost:1250"
    fi
    echo ""
    if [[ "$HAS_OVERRIDES" == "true" ]]; then
        echo "  Models:  $MODEL_MODE base + overrides"
        echo "           transcript=$EFF_TRANSCRIPT, diarization=$EFF_DIARIZATION"
        echo "           translation=$EFF_TRANSLATION, padding=$EFF_PADDING, mixdown=$EFF_MIXDOWN"
    else
        echo "  Models:  $MODEL_MODE (transcription/diarization/translation/padding)"
    fi
    [[ "$USE_GARAGE" == "true" ]] && echo "  Storage: Garage (local S3)"
    [[ "$USE_GARAGE" != "true" ]] && echo "  Storage: External S3"
    [[ "$USES_OLLAMA" == "true" ]] && echo "  LLM:     Ollama ($OLLAMA_MODEL) for summarization/topics"
    [[ "$USES_OLLAMA" != "true" ]] && echo "  LLM:     External (configure in server/.env)"
    [[ "$DAILY_DETECTED" == "true" ]] && echo "  Video:   Daily.co (live rooms + multitrack processing via Hatchet)"
    [[ "$WHEREBY_DETECTED" == "true" ]] && echo "  Video:   Whereby (live rooms)"
    [[ "$LIVEKIT_DETECTED" == "true" ]] && echo "  Video:   LiveKit (self-hosted, live rooms + track egress)"
    [[ "$ANY_PLATFORM_DETECTED" != "true" ]] && echo "  Video:   None (rooms disabled)"
    if [[ "$USE_CUSTOM_CA" == "true" ]]; then
        echo "  CA:      Custom (certs/ca.crt)"
        [[ -n "$TLS_CERT_PATH" ]] && echo "  TLS:     Custom cert (certs/server.pem)"
    fi
    echo ""
    if [[ "$USE_CUSTOM_CA" == "true" ]]; then
        echo "  NOTE: Clients must trust the CA certificate to avoid browser warnings."
        echo "        CA cert location: certs/ca.crt"
        echo "        See docsv2/custom-ca-setup.md for instructions."
        echo ""
    fi
    echo "  To stop:   docker compose -f docker-compose.selfhosted.yml down"
    echo "  To re-run: ./scripts/setup-selfhosted.sh          (replays saved config)"
    echo "  Last args: $*"
    echo ""
}

main "$@"
