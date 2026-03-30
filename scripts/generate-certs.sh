#!/usr/bin/env bash
#
# Generate a local CA and server certificate for Reflector self-hosted deployments.
#
# Usage:
#   ./scripts/generate-certs.sh DOMAIN [EXTRA_SANS...]
#
# Examples:
#   ./scripts/generate-certs.sh reflector.local
#   ./scripts/generate-certs.sh reflector.local "DNS:gpu.local,IP:192.168.1.100"
#
# Generates in certs/:
#   ca.key           — CA private key (keep secret)
#   ca.crt           — CA certificate (distribute to clients)
#   server-key.pem   — Server private key
#   server.pem       — Server certificate (signed by CA)
#
# Then use with setup-selfhosted.sh:
#   ./scripts/setup-selfhosted.sh --gpu --caddy --domain DOMAIN --custom-ca certs/
#
set -euo pipefail

DOMAIN="${1:?Usage: $0 DOMAIN [EXTRA_SANS...]}"
EXTRA_SANS="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/certs"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'
info()  { echo -e "${CYAN}==>${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }

# Check for openssl
if ! command -v openssl &>/dev/null; then
    echo "Error: openssl is required but not found. Install it first." >&2
    exit 1
fi

mkdir -p "$CERTS_DIR"

# Build SAN list
SAN_LIST="DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1"
if [[ -n "$EXTRA_SANS" ]]; then
    SAN_LIST="$SAN_LIST,$EXTRA_SANS"
fi

info "Generating CA and server certificate for: $DOMAIN"
echo "  SANs: $SAN_LIST"
echo ""

# --- Step 1: Generate CA ---
if [[ -f "$CERTS_DIR/ca.key" ]] && [[ -f "$CERTS_DIR/ca.crt" ]]; then
    ok "CA already exists at certs/ca.key + certs/ca.crt — reusing"
else
    info "Generating CA key and certificate..."
    openssl genrsa -out "$CERTS_DIR/ca.key" 4096 2>/dev/null
    openssl req -x509 -new -nodes \
        -key "$CERTS_DIR/ca.key" \
        -sha256 -days 3650 \
        -out "$CERTS_DIR/ca.crt" \
        -subj "/CN=Reflector Local CA/O=Reflector Self-Hosted"
    ok "CA certificate generated (valid for 10 years)"
fi

# --- Step 2: Generate server key ---
info "Generating server key..."
openssl genrsa -out "$CERTS_DIR/server-key.pem" 2048 2>/dev/null
ok "Server key generated"

# --- Step 3: Create CSR with SANs ---
info "Creating certificate signing request..."
openssl req -new \
    -key "$CERTS_DIR/server-key.pem" \
    -out "$CERTS_DIR/server.csr" \
    -subj "/CN=$DOMAIN" \
    -addext "subjectAltName=$SAN_LIST"
ok "CSR created"

# --- Step 4: Sign with CA ---
info "Signing server certificate with CA..."
openssl x509 -req \
    -in "$CERTS_DIR/server.csr" \
    -CA "$CERTS_DIR/ca.crt" \
    -CAkey "$CERTS_DIR/ca.key" \
    -CAcreateserial \
    -out "$CERTS_DIR/server.pem" \
    -days 365 -sha256 \
    -copy_extensions copyall \
    2>/dev/null
ok "Server certificate signed (valid for 1 year)"

# --- Cleanup ---
rm -f "$CERTS_DIR/server.csr" "$CERTS_DIR/ca.srl"

# --- Set permissions ---
chmod 644 "$CERTS_DIR/ca.crt" "$CERTS_DIR/server.pem"
chmod 600 "$CERTS_DIR/ca.key" "$CERTS_DIR/server-key.pem"

echo ""
echo "=========================================="
echo -e " ${GREEN}Certificates generated in certs/${NC}"
echo "=========================================="
echo ""
echo "  certs/ca.key           CA private key (keep secret)"
echo "  certs/ca.crt           CA certificate (distribute to clients)"
echo "  certs/server-key.pem   Server private key"
echo "  certs/server.pem       Server certificate for $DOMAIN"
echo ""
echo "  SANs: $SAN_LIST"
echo ""
echo "Use with setup-selfhosted.sh:"
echo "  ./scripts/setup-selfhosted.sh --gpu --caddy --domain $DOMAIN --custom-ca certs/"
echo ""
echo "Trust the CA on your machine:"
case "$(uname -s)" in
    Darwin)
        echo "  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca.crt"
        ;;
    Linux)
        echo "  sudo cp certs/ca.crt /usr/local/share/ca-certificates/reflector-ca.crt"
        echo "  sudo update-ca-certificates"
        ;;
    *)
        echo "  See docsv2/custom-ca-setup.md for your platform"
        ;;
esac
echo ""
