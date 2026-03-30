# Custom CA Certificate Setup

Use a private Certificate Authority (CA) with Reflector self-hosted deployments. This covers two scenarios:

1. **Custom local domain** — Serve Reflector over HTTPS on an internal domain (e.g., `reflector.local`) using certs signed by your own CA
2. **Backend CA trust** — Let Reflector's backend services (server, workers, GPU) make HTTPS calls to GPU, LLM, or other internal services behind your private CA

Both can be used independently or together.

## Quick Start

### Generate test certificates

```bash
./scripts/generate-certs.sh reflector.local
```

This creates `certs/` with:
- `ca.key` + `ca.crt` — Root CA (10-year validity)
- `server-key.pem` + `server.pem` — Server certificate (1-year, SAN: domain + localhost + 127.0.0.1)

### Deploy with custom CA + domain

```bash
# Add domain to /etc/hosts on the server (use 127.0.0.1 for local, or server LAN IP for network access)
echo "127.0.0.1 reflector.local" | sudo tee -a /etc/hosts

# Run setup — pass the certs directory
./scripts/setup-selfhosted.sh --gpu --caddy --domain reflector.local --custom-ca certs/

# Trust the CA on your machine (see "Trust the CA" section below)
```

### Deploy with CA trust only (GPU/LLM behind private CA)

```bash
# Only need the CA cert file — no Caddy TLS certs needed
./scripts/setup-selfhosted.sh --hosted --custom-ca /path/to/corporate-ca.crt
```

## How `--custom-ca` Works

The flag accepts a **directory** or a **single file**:

### Directory mode

```bash
--custom-ca certs/
```

Looks for these files by convention:
- `ca.crt` (required) — CA certificate to trust
- `server.pem` + `server-key.pem` (optional) — TLS certificate/key for Caddy

If `server.pem` + `server-key.pem` are found AND `--domain` is provided:
- Caddy serves HTTPS using those certs
- Backend containers trust the CA for outbound calls

If only `ca.crt` is found:
- Backend containers trust the CA for outbound calls
- Caddy is unaffected (uses Let's Encrypt, self-signed, or no Caddy)

### Single file mode

```bash
--custom-ca /path/to/corporate-ca.crt
```

Only injects CA trust into backend containers. No Caddy TLS changes.

## Scenarios

### Scenario 1: Custom local domain

Your Reflector instance runs on an internal network. You want `https://reflector.local` with proper TLS (no browser warnings).

```bash
# 1. Generate certs
./scripts/generate-certs.sh reflector.local

# 2. Add to /etc/hosts on the server
echo "127.0.0.1 reflector.local" | sudo tee -a /etc/hosts

# 3. Deploy
./scripts/setup-selfhosted.sh --gpu --garage --caddy --domain reflector.local --custom-ca certs/

# 4. Trust the CA on your machine (see "Trust the CA" section below)
```

If other machines on the network need to access it, add the server's LAN IP to `/etc/hosts` on those machines instead:
```bash
echo "192.168.1.100 reflector.local" | sudo tee -a /etc/hosts
```

And include that IP as an extra SAN when generating certs:
```bash
./scripts/generate-certs.sh reflector.local "IP:192.168.1.100"
```

### Scenario 2: GPU/LLM behind corporate CA

Your GPU or LLM server (e.g., `https://gpu.internal.corp`) uses certificates signed by your corporate CA. Reflector's backend needs to trust that CA for outbound HTTPS calls.

```bash
# Get the CA certificate from your IT team (PEM format)
# Then deploy — Caddy can still use Let's Encrypt or self-signed
./scripts/setup-selfhosted.sh --hosted --garage --caddy --custom-ca /path/to/corporate-ca.crt
```

This works because:
- **TLS cert/key** = "this is my identity" — for Caddy to serve HTTPS to browsers
- **CA cert** = "I trust this authority" — for backend containers to verify outbound connections

Your Reflector frontend can use Let's Encrypt (public domain) or self-signed certs, while the backend trusts a completely different CA for GPU/LLM calls.

### Scenario 3: Both combined (same CA)

Custom domain + GPU/LLM all behind the same CA:

```bash
./scripts/generate-certs.sh reflector.local "DNS:gpu.local"
./scripts/setup-selfhosted.sh --gpu --garage --caddy --domain reflector.local --custom-ca certs/
```

### Scenario 4: Multiple CAs (local domain + remote GPU on different CA)

Your Reflector uses one CA for `reflector.local`, but the GPU host uses a different CA:

```bash
# Your local domain setup
./scripts/generate-certs.sh reflector.local

# Deploy with your CA + trust the GPU host's CA too
./scripts/setup-selfhosted.sh --hosted --garage --caddy \
    --domain reflector.local \
    --custom-ca certs/ \
    --extra-ca /path/to/gpu-machine-ca.crt
```

`--extra-ca` appends additional CA certs to the trust bundle. Backend containers trust ALL CAs — your local domain AND the GPU host's certs both work.

You can repeat `--extra-ca` for multiple remote services:
```bash
--extra-ca /path/to/gpu-ca.crt --extra-ca /path/to/llm-ca.crt
```

For setting up a dedicated GPU host, see [Standalone GPU Host Setup](gpu-host-setup.md).

## Trust the CA on Client Machines

After deploying, clients need to trust the CA to avoid browser warnings.

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain certs/ca.crt
```

### Linux (Ubuntu/Debian)

```bash
sudo cp certs/ca.crt /usr/local/share/ca-certificates/reflector-ca.crt
sudo update-ca-certificates
```

### Linux (RHEL/Fedora)

```bash
sudo cp certs/ca.crt /etc/pki/ca-trust/source/anchors/reflector-ca.crt
sudo update-ca-trust
```

### Windows (PowerShell as admin)

```powershell
Import-Certificate -FilePath .\certs\ca.crt -CertStoreLocation Cert:\LocalMachine\Root
```

### Firefox (all platforms)

Firefox uses its own certificate store:
1. Settings > Privacy & Security > View Certificates
2. Authorities tab > Import
3. Select `ca.crt` and check "Trust this CA to identify websites"

## How It Works Internally

### Docker entrypoint CA injection

Each backend container (server, worker, beat, hatchet workers, GPU) has an entrypoint script (`docker-entrypoint.sh`) that:

1. Checks if a CA cert is mounted at `/usr/local/share/ca-certificates/custom-ca.crt`
2. If present, runs `update-ca-certificates` to create a **combined bundle** (system CAs + custom CA)
3. Sets environment variables so all Python/gRPC libraries use the combined bundle:

| Env var | Covers |
|---------|--------|
| `SSL_CERT_FILE` | httpx, OpenAI SDK, llama-index, Python ssl module |
| `REQUESTS_CA_BUNDLE` | requests library (transitive dependencies) |
| `CURL_CA_BUNDLE` | curl CLI (container healthchecks) |

Note: `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH` is intentionally NOT set. Setting it causes grpcio to attempt TLS on internal Hatchet gRPC connections that run without TLS, resulting in handshake failures. The internal Hatchet connection uses `HATCHET_CLIENT_TLS_STRATEGY=none` (plaintext).

When no CA cert is mounted, the entrypoint is a no-op — containers behave exactly as before.

### Why this replaces manual certifi patching

Previously, the workaround for trusting a private CA in Python was to patch certifi's bundle directly:

```bash
# OLD approach — fragile, do NOT use
cat custom-ca.crt >> $(python -c "import certifi; print(certifi.where())")
```

This breaks whenever certifi is updated (any `pip install`/`uv sync` overwrites the bundle and the CA is lost).

Our entrypoint approach is permanent because:

1. `SSL_CERT_FILE` is checked by Python's `ssl.create_default_context()` **before** falling back to `certifi.where()`. When set, certifi's bundle is never read.
2. `REQUESTS_CA_BUNDLE` similarly overrides certifi for the `requests` library.
3. The CA is injected at container startup (runtime), not baked into the Python environment. It survives image rebuilds, dependency updates, and `uv sync`.

```
Python SSL lookup chain:
  ssl.create_default_context()
    → SSL_CERT_FILE env var? → YES → use combined bundle (system + custom CA) ✓
    → (certifi.where() is never reached)
```

This covers all outbound HTTPS calls: httpx (transcription, diarization, translation, webhooks), OpenAI SDK (transcription), llama-index (LLM/summarization), and requests (transitive dependencies).

### Compose override

The setup script generates `docker-compose.ca.yml` which mounts the CA cert into every backend container as a read-only bind mount. This file is:
- Only generated when `--custom-ca` is passed
- Deleted on re-runs without `--custom-ca` (prevents stale overrides)
- Added to `.gitignore`

### Node.js (frontend)

The web container uses `NODE_EXTRA_CA_CERTS` which **adds** to Node's trust store (unlike Python's `SSL_CERT_FILE` which replaces it). This is set via the compose override.

## Generate Your Own CA (Manual)

If you prefer not to use `generate-certs.sh`:

```bash
# 1. Create CA
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
    -out ca.crt -subj "/CN=My CA/O=My Organization"

# 2. Create server key
openssl genrsa -out server-key.pem 2048

# 3. Create CSR with SANs
openssl req -new -key server-key.pem -out server.csr \
    -subj "/CN=reflector.local" \
    -addext "subjectAltName=DNS:reflector.local,DNS:localhost,IP:127.0.0.1"

# 4. Sign with CA
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
    -CAcreateserial -out server.pem -days 365 -sha256 \
    -copy_extensions copyall

# 5. Clean up
rm server.csr ca.srl
```

## Using Existing Corporate Certificates

If your organization already has a CA:

1. Get the CA certificate in PEM format from your IT team
2. If you have a PKCS#12 (.p12/.pfx) bundle, extract the CA cert:
   ```bash
   openssl pkcs12 -in bundle.p12 -cacerts -nokeys -out ca.crt
   ```
3. If you have multiple intermediate CAs, concatenate them into one PEM file:
   ```bash
   cat intermediate-ca.crt root-ca.crt > ca.crt
   ```

## Troubleshooting

### Browser: "Your connection is not private"

The CA is not trusted on the client machine. See "Trust the CA" section above.

Check certificate expiry:
```bash
openssl x509 -noout -dates -in certs/server.pem
```

### Backend: `SSL: CERTIFICATE_VERIFY_FAILED`

CA cert not mounted or not loaded. Check inside the container:
```bash
docker compose exec server env | grep SSL_CERT_FILE
docker compose exec server python -c "
import ssl, os
print('SSL_CERT_FILE:', os.environ.get('SSL_CERT_FILE', 'not set'))
ctx = ssl.create_default_context()
print('CA certs loaded:', ctx.cert_store_stats())
"
```

### Caddy: "certificate is not valid for any names"

Domain in Caddyfile doesn't match the certificate's SAN/CN. Check:
```bash
openssl x509 -noout -text -in certs/server.pem | grep -A1 "Subject Alternative Name"
```

### Certificate chain issues

If you have intermediate CAs, concatenate them into `server.pem`:
```bash
cat server-cert.pem intermediate-ca.pem > certs/server.pem
```

Verify the chain:
```bash
openssl verify -CAfile certs/ca.crt certs/server.pem
```

### Certificate renewal

Custom CA certs are NOT auto-renewed (unlike Let's Encrypt). Replace cert files and restart:
```bash
# Replace certs
cp new-server.pem certs/server.pem
cp new-server-key.pem certs/server-key.pem

# Restart Caddy to pick up new certs
docker compose restart caddy
```
