#!/usr/bin/env bash
#
# Standalone GPU service setup for Reflector.
# Deploys ONLY the GPU transcription/diarization/translation service on a dedicated machine.
# The main Reflector instance connects to this machine over HTTPS.
#
# Usage:
#   ./scripts/setup-gpu-host.sh [--domain DOMAIN] [--custom-ca PATH] [--extra-ca FILE] [--api-key KEY] [--cpu] [--build]
#
# Options:
#   --domain DOMAIN    Domain name for this GPU host (e.g., gpu.example.com)
#                      With --custom-ca: uses custom TLS cert. Without: uses Let's Encrypt.
#   --custom-ca PATH   Custom CA certificate (dir with ca.crt + server.pem + server-key.pem, or single PEM file)
#   --extra-ca FILE    Additional CA cert to trust (repeatable)
#   --api-key KEY      API key to protect the GPU service (recommended for internet-facing deployments)
#   --cpu              Use CPU-only Dockerfile (no NVIDIA GPU required)
#   --build            Build image from source (default: build, since no pre-built GPU image is published)
#   --port PORT        Host port to expose (default: 443 with Caddy, 8000 without)
#
# Examples:
#   # GPU on LAN with custom CA
#   ./scripts/generate-certs.sh gpu.local
#   ./scripts/setup-gpu-host.sh --domain gpu.local --custom-ca certs/ --api-key my-secret-key
#
#   # GPU on public internet with Let's Encrypt
#   ./scripts/setup-gpu-host.sh --domain gpu.example.com --api-key my-secret-key
#
#   # GPU on LAN, IP access only (self-signed cert)
#   ./scripts/setup-gpu-host.sh --api-key my-secret-key
#
#   # CPU-only mode (no NVIDIA GPU)
#   ./scripts/setup-gpu-host.sh --cpu --api-key my-secret-key
#
# After setup, configure the main Reflector instance to use this GPU:
#   In server/.env on the Reflector machine:
#     TRANSCRIPT_BACKEND=modal
#     TRANSCRIPT_URL=https://gpu.example.com
#     TRANSCRIPT_MODAL_API_KEY=my-secret-key
#     DIARIZATION_BACKEND=modal
#     DIARIZATION_URL=https://gpu.example.com
#     DIARIZATION_MODAL_API_KEY=my-secret-key
#     TRANSLATION_BACKEND=modal
#     TRANSLATE_URL=https://gpu.example.com
#     TRANSLATION_MODAL_API_KEY=my-secret-key
#
# DNS Resolution:
#   - Public domain: Create a DNS A record pointing to this machine's public IP.
#   - Internal domain (e.g., gpu.local): Add to /etc/hosts on both machines:
#       <GPU_MACHINE_IP> gpu.local
#   - IP-only: Use the machine's IP directly in TRANSCRIPT_URL/DIARIZATION_URL.
#     The Reflector backend must trust the CA or accept self-signed certs.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

GPU_DIR="$ROOT_DIR/gpu/self_hosted"
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

# --- Parse arguments ---
CUSTOM_DOMAIN=""
CUSTOM_CA=""
EXTRA_CA_FILES=()
API_KEY=""
USE_CPU=false
HOST_PORT=""

SKIP_NEXT=false
ARGS=("$@")
for i in "${!ARGS[@]}"; do
    if [[ "$SKIP_NEXT" == "true" ]]; then
        SKIP_NEXT=false
        continue
    fi
    arg="${ARGS[$i]}"
    case "$arg" in
        --domain)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--domain requires a domain name"
                exit 1
            fi
            CUSTOM_DOMAIN="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --custom-ca)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--custom-ca requires a path to a directory or PEM certificate file"
                exit 1
            fi
            CUSTOM_CA="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --extra-ca)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--extra-ca requires a path to a PEM certificate file"
                exit 1
            fi
            if [[ ! -f "${ARGS[$next_i]}" ]]; then
                err "--extra-ca file not found: ${ARGS[$next_i]}"
                exit 1
            fi
            EXTRA_CA_FILES+=("${ARGS[$next_i]}")
            SKIP_NEXT=true ;;
        --api-key)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--api-key requires a key value"
                exit 1
            fi
            API_KEY="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --cpu)
            USE_CPU=true ;;
        --port)
            next_i=$((i + 1))
            if [[ $next_i -ge ${#ARGS[@]} ]] || [[ "${ARGS[$next_i]}" == --* ]]; then
                err "--port requires a port number"
                exit 1
            fi
            HOST_PORT="${ARGS[$next_i]}"
            SKIP_NEXT=true ;;
        --build)
            ;; # Always build from source for GPU, flag accepted for compatibility
        *)
            err "Unknown argument: $arg"
            err "Usage: $0 [--domain DOMAIN] [--custom-ca PATH] [--extra-ca FILE] [--api-key KEY] [--cpu] [--port PORT]"
            exit 1
            ;;
    esac
done

# --- Resolve CA paths ---
CA_CERT_PATH=""
TLS_CERT_PATH=""
TLS_KEY_PATH=""
USE_CUSTOM_CA=false
USE_CADDY=false

if [[ -n "$CUSTOM_CA" ]] || [[ -n "${EXTRA_CA_FILES[0]+x}" ]]; then
    USE_CUSTOM_CA=true
fi

if [[ -n "$CUSTOM_CA" ]]; then
    CUSTOM_CA="${CUSTOM_CA%/}"
    if [[ -d "$CUSTOM_CA" ]]; then
        [[ -f "$CUSTOM_CA/ca.crt" ]] || { err "$CUSTOM_CA/ca.crt not found"; exit 1; }
        CA_CERT_PATH="$CUSTOM_CA/ca.crt"
        if [[ -f "$CUSTOM_CA/server.pem" ]] && [[ -f "$CUSTOM_CA/server-key.pem" ]]; then
            TLS_CERT_PATH="$CUSTOM_CA/server.pem"
            TLS_KEY_PATH="$CUSTOM_CA/server-key.pem"
        elif [[ -f "$CUSTOM_CA/server.pem" ]] || [[ -f "$CUSTOM_CA/server-key.pem" ]]; then
            warn "Found only one of server.pem/server-key.pem — both needed for TLS. Skipping."
        fi
    elif [[ -f "$CUSTOM_CA" ]]; then
        CA_CERT_PATH="$CUSTOM_CA"
    else
        err "--custom-ca path not found: $CUSTOM_CA"
        exit 1
    fi
elif [[ -n "${EXTRA_CA_FILES[0]+x}" ]]; then
    CA_CERT_PATH="${EXTRA_CA_FILES[0]}"
    unset 'EXTRA_CA_FILES[0]'
    EXTRA_CA_FILES=("${EXTRA_CA_FILES[@]+"${EXTRA_CA_FILES[@]}"}")
fi

# Caddy if we have a domain or TLS certs
if [[ -n "$CUSTOM_DOMAIN" ]] || [[ -n "$TLS_CERT_PATH" ]]; then
    USE_CADDY=true
fi

# Default port
if [[ -z "$HOST_PORT" ]]; then
    if [[ "$USE_CADDY" == "true" ]]; then
        HOST_PORT="443"
    else
        HOST_PORT="8000"
    fi
fi

# Detect primary IP
PRIMARY_IP=""
if [[ "$OS" == "Linux" ]]; then
    PRIMARY_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    if [[ "$PRIMARY_IP" == "127."* ]] || [[ -z "$PRIMARY_IP" ]]; then
        PRIMARY_IP=$(ip -4 route get 1 2>/dev/null | sed -n 's/.*src \([0-9.]*\).*/\1/p' || true)
    fi
fi

# --- Display config ---
echo ""
echo "=========================================="
echo " Reflector — Standalone GPU Host Setup"
echo "=========================================="
echo ""
echo "  Mode:    $(if [[ "$USE_CPU" == "true" ]]; then echo "CPU-only"; else echo "NVIDIA GPU"; fi)"
echo "  Caddy:   $USE_CADDY"
[[ -n "$CUSTOM_DOMAIN" ]] && echo "  Domain:  $CUSTOM_DOMAIN"
[[ "$USE_CUSTOM_CA" == "true" ]] && echo "  CA:      Custom"
[[ -n "$TLS_CERT_PATH" ]] && echo "  TLS:     Custom cert"
[[ -n "$API_KEY" ]] && echo "  Auth:    API key protected"
[[ -z "$API_KEY" ]] && echo "  Auth:    NONE (open access — use --api-key for production!)"
echo "  Port:    $HOST_PORT"
echo ""

# --- Prerequisites ---
info "Checking prerequisites"

if ! command -v docker &>/dev/null; then
    err "Docker not found. Install Docker first."
    exit 1
fi
ok "Docker available"

if ! docker compose version &>/dev/null; then
    err "Docker Compose V2 not found."
    exit 1
fi
ok "Docker Compose V2 available"

if [[ "$USE_CPU" != "true" ]]; then
    if ! docker info 2>/dev/null | grep -qi nvidia; then
        warn "NVIDIA runtime not detected in Docker. GPU mode may fail."
        warn "Install nvidia-container-toolkit if you have an NVIDIA GPU."
    else
        ok "NVIDIA Docker runtime available"
    fi
fi

# --- Stage certificates ---
CERTS_DIR="$ROOT_DIR/certs"
if [[ "$USE_CUSTOM_CA" == "true" ]]; then
    info "Staging certificates"
    mkdir -p "$CERTS_DIR"

    if [[ -n "$CA_CERT_PATH" ]]; then
        local_ca_dest="$CERTS_DIR/ca.crt"
        src_id=$(ls -i "$CA_CERT_PATH" 2>/dev/null | awk '{print $1}')
        dst_id=$(ls -i "$local_ca_dest" 2>/dev/null | awk '{print $1}')
        if [[ "$src_id" != "$dst_id" ]] || [[ -z "$dst_id" ]]; then
            cp "$CA_CERT_PATH" "$local_ca_dest"
        fi
        chmod 644 "$local_ca_dest"
        ok "CA certificate staged"

        # Append extra CAs
        for extra_ca in "${EXTRA_CA_FILES[@]+"${EXTRA_CA_FILES[@]}"}"; do
            echo "" >> "$local_ca_dest"
            cat "$extra_ca" >> "$local_ca_dest"
            ok "Appended extra CA: $extra_ca"
        done
    fi

    if [[ -n "$TLS_CERT_PATH" ]]; then
        cert_dest="$CERTS_DIR/server.pem"
        key_dest="$CERTS_DIR/server-key.pem"
        src_id=$(ls -i "$TLS_CERT_PATH" 2>/dev/null | awk '{print $1}')
        dst_id=$(ls -i "$cert_dest" 2>/dev/null | awk '{print $1}')
        if [[ "$src_id" != "$dst_id" ]] || [[ -z "$dst_id" ]]; then
            cp "$TLS_CERT_PATH" "$cert_dest"
            cp "$TLS_KEY_PATH" "$key_dest"
        fi
        chmod 644 "$cert_dest"
        chmod 600 "$key_dest"
        ok "TLS cert/key staged"
    fi
fi

# --- Build profiles and compose command ---
COMPOSE_FILE="$ROOT_DIR/docker-compose.gpu-host.yml"
COMPOSE_PROFILES=()
GPU_SERVICE="gpu"

if [[ "$USE_CPU" == "true" ]]; then
    COMPOSE_PROFILES+=("cpu")
    GPU_SERVICE="cpu"
else
    COMPOSE_PROFILES+=("gpu")
fi
if [[ "$USE_CADDY" == "true" ]]; then
    COMPOSE_PROFILES+=("caddy")
fi

# Compose command helper
compose_cmd() {
    local profiles="" files="-f $COMPOSE_FILE"
    if [[ "$USE_CUSTOM_CA" == "true" ]] && [[ -f "$ROOT_DIR/docker-compose.gpu-ca.yml" ]]; then
        files="$files -f $ROOT_DIR/docker-compose.gpu-ca.yml"
    fi
    for p in "${COMPOSE_PROFILES[@]}"; do
        profiles="$profiles --profile $p"
    done
    docker compose $files $profiles "$@"
}

# Generate CA compose override if needed (mounts certs into containers)
if [[ "$USE_CUSTOM_CA" == "true" ]]; then
    info "Generating docker-compose.gpu-ca.yml override"
    ca_override="$ROOT_DIR/docker-compose.gpu-ca.yml"
    cat > "$ca_override" << 'CAEOF'
# Generated by setup-gpu-host.sh — custom CA trust.
# Do not edit manually; re-run setup-gpu-host.sh with --custom-ca to regenerate.
services:
  gpu:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
  cpu:
    volumes:
      - ./certs/ca.crt:/usr/local/share/ca-certificates/custom-ca.crt:ro
CAEOF

    if [[ -n "$TLS_CERT_PATH" ]]; then
        cat >> "$ca_override" << 'CADDYCAEOF'
  caddy:
    volumes:
      - ./certs:/etc/caddy/certs:ro
CADDYCAEOF
    fi
    ok "Generated docker-compose.gpu-ca.yml"
else
    rm -f "$ROOT_DIR/docker-compose.gpu-ca.yml"
fi

# --- Generate Caddyfile ---
if [[ "$USE_CADDY" == "true" ]]; then
    info "Generating Caddyfile.gpu-host"

    CADDYFILE="$ROOT_DIR/Caddyfile.gpu-host"

    if [[ -n "$TLS_CERT_PATH" ]] && [[ -n "$CUSTOM_DOMAIN" ]]; then
        cat > "$CADDYFILE" << CADDYEOF
# Generated by setup-gpu-host.sh — Custom TLS cert for $CUSTOM_DOMAIN
$CUSTOM_DOMAIN {
    tls /etc/caddy/certs/server.pem /etc/caddy/certs/server-key.pem
    reverse_proxy transcription:8000
}
CADDYEOF
        ok "Caddyfile: custom TLS for $CUSTOM_DOMAIN"
    elif [[ -n "$CUSTOM_DOMAIN" ]]; then
        cat > "$CADDYFILE" << CADDYEOF
# Generated by setup-gpu-host.sh — Let's Encrypt for $CUSTOM_DOMAIN
$CUSTOM_DOMAIN {
    reverse_proxy transcription:8000
}
CADDYEOF
        ok "Caddyfile: Let's Encrypt for $CUSTOM_DOMAIN"
    else
        cat > "$CADDYFILE" << 'CADDYEOF'
# Generated by setup-gpu-host.sh — self-signed cert for IP access
:443 {
    tls internal
    reverse_proxy transcription:8000
}
CADDYEOF
        ok "Caddyfile: self-signed cert for IP access"
    fi
fi

# --- Generate .env ---
info "Generating GPU service .env"

GPU_ENV="$ROOT_DIR/.env.gpu-host"
cat > "$GPU_ENV" << EOF
# Generated by setup-gpu-host.sh
# HuggingFace token for pyannote diarization models
HF_TOKEN=${HF_TOKEN:-}
# API key to protect the GPU service (set via --api-key)
REFLECTOR_GPU_APIKEY=${API_KEY:-}
# Port configuration
GPU_HOST_PORT=${HOST_PORT}
CADDY_HTTPS_PORT=${HOST_PORT}
EOF

if [[ -z "${HF_TOKEN:-}" ]]; then
    warn "HF_TOKEN not set. Diarization requires a HuggingFace token."
    warn "Set it: export HF_TOKEN=your-token-here and re-run, or edit .env.gpu-host"
fi

ok "Generated .env.gpu-host"

# --- Build and start ---
info "Building $GPU_SERVICE image (first build downloads ML models — may take a while)..."
compose_cmd --env-file "$GPU_ENV" build "$GPU_SERVICE"
ok "$GPU_SERVICE image built"

info "Starting services..."
compose_cmd --env-file "$GPU_ENV" up -d
ok "Services started"

# --- Wait for health ---
info "Waiting for GPU service to be healthy (model loading takes 1-2 minutes)..."
local_url="http://localhost:8000"
for i in $(seq 1 40); do
    if curl -sf "$local_url/docs" >/dev/null 2>&1; then
        ok "GPU service is healthy!"
        break
    fi
    if [[ $i -eq 40 ]]; then
        err "GPU service did not become healthy after 5 minutes."
        err "Check logs: docker compose -f docker-compose.gpu-host.yml logs gpu"
        exit 1
    fi
    sleep 8
done

# --- Summary ---
echo ""
echo "=========================================="
echo -e " ${GREEN}GPU service is running!${NC}"
echo "=========================================="
echo ""

if [[ "$USE_CADDY" == "true" ]]; then
    if [[ -n "$CUSTOM_DOMAIN" ]]; then
        echo "  URL:     https://$CUSTOM_DOMAIN"
    elif [[ -n "$PRIMARY_IP" ]]; then
        echo "  URL:     https://$PRIMARY_IP"
    else
        echo "  URL:     https://localhost"
    fi
else
    if [[ -n "$PRIMARY_IP" ]]; then
        echo "  URL:     http://$PRIMARY_IP:$HOST_PORT"
    else
        echo "  URL:     http://localhost:$HOST_PORT"
    fi
fi

echo "  Health:  curl \$(URL)/docs"
[[ -n "$API_KEY" ]] && echo "  API key: $API_KEY"
echo ""
echo "  Configure the main Reflector instance (in server/.env):"
echo ""

local_gpu_url=""
if [[ "$USE_CADDY" == "true" ]]; then
    if [[ -n "$CUSTOM_DOMAIN" ]]; then
        local_gpu_url="https://$CUSTOM_DOMAIN"
    elif [[ -n "$PRIMARY_IP" ]]; then
        local_gpu_url="https://$PRIMARY_IP"
    else
        local_gpu_url="https://localhost"
    fi
else
    if [[ -n "$PRIMARY_IP" ]]; then
        local_gpu_url="http://$PRIMARY_IP:$HOST_PORT"
    else
        local_gpu_url="http://localhost:$HOST_PORT"
    fi
fi

echo "    TRANSCRIPT_BACKEND=modal"
echo "    TRANSCRIPT_URL=$local_gpu_url"
[[ -n "$API_KEY" ]] && echo "    TRANSCRIPT_MODAL_API_KEY=$API_KEY"
echo "    DIARIZATION_BACKEND=modal"
echo "    DIARIZATION_URL=$local_gpu_url"
[[ -n "$API_KEY" ]] && echo "    DIARIZATION_MODAL_API_KEY=$API_KEY"
echo "    TRANSLATION_BACKEND=modal"
echo "    TRANSLATE_URL=$local_gpu_url"
[[ -n "$API_KEY" ]] && echo "    TRANSLATION_MODAL_API_KEY=$API_KEY"
echo ""

if [[ "$USE_CUSTOM_CA" == "true" ]]; then
    echo "  The Reflector instance must also trust this CA."
    echo "  On the Reflector machine, run setup-selfhosted.sh with:"
    echo "    --extra-ca /path/to/this-machines-ca.crt"
    echo ""
fi

echo "  DNS Resolution:"
if [[ -n "$CUSTOM_DOMAIN" ]]; then
    echo "    Ensure '$CUSTOM_DOMAIN' resolves to this machine's IP."
    echo "    Public: Create a DNS A record."
    echo "    Internal: Add to /etc/hosts on the Reflector machine:"
    echo "      ${PRIMARY_IP:-<GPU_IP>} $CUSTOM_DOMAIN"
else
    echo "    Use this machine's IP directly in TRANSCRIPT_URL/DIARIZATION_URL."
fi
echo ""
echo "  To stop:   docker compose -f docker-compose.gpu-host.yml down"
echo "  To re-run: ./scripts/setup-gpu-host.sh $*"
echo "  Logs:      docker compose -f docker-compose.gpu-host.yml logs -f gpu"
echo ""
