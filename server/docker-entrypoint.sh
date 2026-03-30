#!/bin/bash
set -e

# Custom CA certificate injection
# If a CA cert is mounted at this path (via docker-compose.ca.yml),
# add it to the system trust store and configure all Python SSL libraries.
CUSTOM_CA_PATH="/usr/local/share/ca-certificates/custom-ca.crt"

if [ -s "$CUSTOM_CA_PATH" ]; then
    echo "[entrypoint] Custom CA certificate detected, updating trust store..."
    update-ca-certificates 2>/dev/null

    # update-ca-certificates creates a combined bundle (system + custom CAs)
    COMBINED_BUNDLE="/etc/ssl/certs/ca-certificates.crt"
    export SSL_CERT_FILE="$COMBINED_BUNDLE"
    export REQUESTS_CA_BUNDLE="$COMBINED_BUNDLE"
    export CURL_CA_BUNDLE="$COMBINED_BUNDLE"
    # Note: GRPC_DEFAULT_SSL_ROOTS_FILE_PATH is intentionally NOT set here.
    # Setting it causes grpcio to attempt TLS on internal Hatchet connections
    # that run without TLS (SERVER_GRPC_INSECURE=t), resulting in handshake failures.
    # If you need gRPC with custom CA, set GRPC_DEFAULT_SSL_ROOTS_FILE_PATH explicitly.
    echo "[entrypoint] CA trust store updated (SSL_CERT_FILE=$COMBINED_BUNDLE)"
fi

exec ./runserver.sh
