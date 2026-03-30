# Standalone GPU Host Setup

Deploy Reflector's GPU transcription/diarization/translation service on a dedicated machine, separate from the main Reflector instance. Useful when:

- Your GPU machine is on a different network than the Reflector server
- You want to share one GPU service across multiple Reflector instances
- The GPU machine has special hardware/drivers that can't run the full stack
- You need to scale GPU processing independently

## Architecture

```
┌─────────────────────┐         HTTPS          ┌────────────────────┐
│  Reflector Server    │ ────────────────────── │  GPU Host          │
│  (server, worker,    │  TRANSCRIPT_URL        │  (transcription,   │
│   web, postgres,     │  DIARIZATION_URL       │   diarization,     │
│   redis, hatchet)    │  TRANSLATE_URL         │   translation)     │
│                      │                        │                    │
│  setup-selfhosted.sh │                        │  setup-gpu-host.sh │
│  --hosted            │                        │                    │
└─────────────────────┘                        └────────────────────┘
```

The GPU service is a standalone FastAPI app that exposes transcription, diarization, translation, and audio padding endpoints. It has **no dependencies** on PostgreSQL, Redis, Hatchet, or any other Reflector service.

## Quick Start

### On the GPU machine

```bash
git clone <reflector-repo>
cd reflector

# Set HuggingFace token (required for diarization models)
export HF_TOKEN=your-huggingface-token

# Deploy with HTTPS (Let's Encrypt)
./scripts/setup-gpu-host.sh --domain gpu.example.com --api-key my-secret-key

# Or deploy with custom CA
./scripts/generate-certs.sh gpu.local
./scripts/setup-gpu-host.sh --domain gpu.local --custom-ca certs/ --api-key my-secret-key
```

### On the Reflector machine

```bash
# If the GPU host uses a custom CA, trust it
./scripts/setup-selfhosted.sh --hosted --garage --caddy \
    --extra-ca /path/to/gpu-machine-ca.crt

# Or if you already have --custom-ca for your local domain
./scripts/setup-selfhosted.sh --hosted --garage --caddy \
    --domain reflector.local --custom-ca certs/ \
    --extra-ca /path/to/gpu-machine-ca.crt
```

Then configure `server/.env` to point to the GPU host:

```bash
TRANSCRIPT_BACKEND=modal
TRANSCRIPT_URL=https://gpu.example.com
TRANSCRIPT_MODAL_API_KEY=my-secret-key

DIARIZATION_BACKEND=modal
DIARIZATION_URL=https://gpu.example.com
DIARIZATION_MODAL_API_KEY=my-secret-key

TRANSLATION_BACKEND=modal
TRANSLATE_URL=https://gpu.example.com
TRANSLATION_MODAL_API_KEY=my-secret-key
```

## Script Options

```
./scripts/setup-gpu-host.sh [OPTIONS]

Options:
  --domain DOMAIN    Domain name for HTTPS (Let's Encrypt or custom cert)
  --custom-ca PATH   Custom CA (directory or single PEM file)
  --extra-ca FILE    Additional CA cert to trust (repeatable)
  --api-key KEY      API key to protect the service (strongly recommended)
  --cpu              CPU-only mode (no NVIDIA GPU required)
  --port PORT        Host port (default: 443 with Caddy, 8000 without)
```

## Deployment Scenarios

### Public internet with Let's Encrypt

GPU machine has a public IP and domain:

```bash
./scripts/setup-gpu-host.sh --domain gpu.example.com --api-key my-secret-key
```

Requirements:
- DNS A record: `gpu.example.com` → GPU machine's public IP
- Ports 80 and 443 open
- Caddy auto-provisions Let's Encrypt certificate

### Internal network with custom CA

GPU machine on a private network:

```bash
# Generate certs on the GPU machine
./scripts/generate-certs.sh gpu.internal "IP:192.168.1.200"

# Deploy
./scripts/setup-gpu-host.sh --domain gpu.internal --custom-ca certs/ --api-key my-secret-key
```

On each machine that connects (including the Reflector server), add DNS:
```bash
echo "192.168.1.200 gpu.internal" | sudo tee -a /etc/hosts
```

### IP-only (no domain)

No domain needed — just use the machine's IP:

```bash
./scripts/setup-gpu-host.sh --api-key my-secret-key
```

Caddy is not used; the GPU service runs directly on port 8000 (HTTP). For HTTPS without a domain, the Reflector machine connects via `http://<GPU_IP>:8000`.

### CPU-only (no NVIDIA GPU)

Works on any machine — transcription will be slower:

```bash
./scripts/setup-gpu-host.sh --cpu --domain gpu.example.com --api-key my-secret-key
```

## DNS Resolution

The Reflector server must be able to reach the GPU host by name or IP.

| Setup | DNS Method | TRANSCRIPT_URL example |
|-------|------------|----------------------|
| Public domain | DNS A record | `https://gpu.example.com` |
| Internal domain | `/etc/hosts` on both machines | `https://gpu.internal` |
| IP only | No DNS needed | `http://192.168.1.200:8000` |

For internal domains, add the GPU machine's IP to `/etc/hosts` on the Reflector machine:
```bash
echo "192.168.1.200 gpu.internal" | sudo tee -a /etc/hosts
```

If the Reflector server runs in Docker, the containers resolve DNS from the host (Docker's default DNS behavior). So adding to the host's `/etc/hosts` is sufficient.

## Multi-CA Setup

When your Reflector instance has its own CA (for `reflector.local`) and the GPU host has a different CA:

**On the GPU machine:**
```bash
./scripts/generate-certs.sh gpu.local
./scripts/setup-gpu-host.sh --domain gpu.local --custom-ca certs/ --api-key my-key
```

**On the Reflector machine:**
```bash
# Your local CA for reflector.local + the GPU host's CA
./scripts/setup-selfhosted.sh --hosted --garage --caddy \
    --domain reflector.local \
    --custom-ca certs/ \
    --extra-ca /path/to/gpu-machine-ca.crt
```

The `--extra-ca` flag appends the GPU host's CA to the trust bundle. Backend containers trust both CAs — your local domain works AND outbound calls to the GPU host succeed.

You can repeat `--extra-ca` for multiple remote services:
```bash
--extra-ca /path/to/gpu-ca.crt --extra-ca /path/to/llm-ca.crt
```

## API Key Authentication

The GPU service uses Bearer token authentication via `REFLECTOR_GPU_APIKEY`:

```bash
# Test from the Reflector machine
curl -s https://gpu.example.com/docs                              # No auth needed for docs
curl -s -X POST https://gpu.example.com/v1/audio/transcriptions \
    -H "Authorization: Bearer <my-secret-key>" \                    #gitleaks:allow
    -F "file=@audio.wav"
```

If `REFLECTOR_GPU_APIKEY` is not set, the service accepts all requests (open access). Always use `--api-key` for internet-facing deployments.

The same key goes in Reflector's `server/.env` as `TRANSCRIPT_MODAL_API_KEY` and `DIARIZATION_MODAL_API_KEY`.

## Files

| File | Checked in? | Purpose |
|------|-------------|---------|
| `docker-compose.gpu-host.yml` | Yes | Static compose file with profiles (`gpu`, `cpu`, `caddy`) |
| `.env.gpu-host` | No (generated) | Environment variables (HF_TOKEN, API key, ports) |
| `Caddyfile.gpu-host` | No (generated) | Caddy config (only when using HTTPS) |
| `docker-compose.gpu-ca.yml` | No (generated) | CA cert mounts override (only with --custom-ca) |
| `certs/` | No (generated) | Staged certificates (when using --custom-ca) |

The compose file is checked into the repo — you can read it to understand exactly what runs. The script only generates env vars, Caddyfile, and CA overrides. Profiles control which service starts:

```bash
# What the script does under the hood:
docker compose -f docker-compose.gpu-host.yml --profile gpu --profile caddy \
    --env-file .env.gpu-host up -d

# CPU mode:
docker compose -f docker-compose.gpu-host.yml --profile cpu --profile caddy \
    --env-file .env.gpu-host up -d
```

Both `gpu` and `cpu` services get the network alias `transcription`, so Caddy's config works with either.

## Management

```bash
# View logs
docker compose -f docker-compose.gpu-host.yml --profile gpu logs -f gpu

# Restart
docker compose -f docker-compose.gpu-host.yml --profile gpu restart gpu

# Stop
docker compose -f docker-compose.gpu-host.yml --profile gpu --profile caddy down

# Re-run setup
./scripts/setup-gpu-host.sh [same flags]

# Rebuild after code changes
docker compose -f docker-compose.gpu-host.yml --profile gpu build gpu
docker compose -f docker-compose.gpu-host.yml --profile gpu up -d gpu
```

If you deployed with `--custom-ca`, include the CA override in manual commands:
```bash
docker compose -f docker-compose.gpu-host.yml -f docker-compose.gpu-ca.yml \
    --profile gpu logs -f gpu
```

## Troubleshooting

### GPU service won't start

Check logs:
```bash
docker compose -f docker-compose.gpu-host.yml logs gpu
```

Common causes:
- NVIDIA driver not installed or `nvidia-container-toolkit` missing
- `HF_TOKEN` not set (diarization model download fails)
- Port already in use

### Reflector can't connect to GPU host

From the Reflector machine:
```bash
# Test HTTPS connectivity
curl -v https://gpu.example.com/docs

# If using custom CA, test with explicit CA
curl --cacert /path/to/gpu-ca.crt https://gpu.internal/docs
```

From inside the Reflector container:
```bash
docker compose exec server python -c "
import httpx
r = httpx.get('https://gpu.internal/docs')
print(r.status_code)
"
```

### SSL: CERTIFICATE_VERIFY_FAILED

The Reflector backend doesn't trust the GPU host's CA. Fix:
```bash
# Re-run Reflector setup with the GPU host's CA
./scripts/setup-selfhosted.sh --hosted --extra-ca /path/to/gpu-ca.crt
```

### Diarization returns errors

- Accept pyannote model licenses on HuggingFace:
  - https://huggingface.co/pyannote/speaker-diarization-3.1
  - https://huggingface.co/pyannote/segmentation-3.0
- Verify `HF_TOKEN` is set in `.env.gpu-host`
