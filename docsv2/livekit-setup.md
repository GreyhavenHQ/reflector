# LiveKit Setup (Self-Hosted Video Platform)

LiveKit is the recommended open-source, self-hosted video platform for Reflector. It replaces Daily.co for deployments that need free, fully self-hosted video rooms with per-participant audio recording.

> LiveKit runs alongside Daily.co and Whereby — you choose the platform per room. Existing Daily/Whereby setups are not affected.

## What LiveKit Provides

- **Video/audio rooms** — WebRTC-based conferencing via `livekit-server` (Go SFU)
- **Per-participant audio recording** — Track Egress writes each participant's audio to S3 as a separate OGG/Opus file (no composite video, no Chrome dependency)
- **S3-compatible storage** — works with Garage, MinIO, AWS S3, or any S3-compatible provider via `force_path_style`
- **Webhook events** — participant join/leave, egress start/end, room lifecycle
- **JWT access tokens** — per-participant tokens with granular permissions

## Architecture

```
                    ┌─────────────────┐
  Participants ────>│  livekit-server  │ :7880 (WS signaling)
   (browser)        │   (Go SFU)      │ :7881 (TCP RTC)
                    │                  │ :44200-44300/udp (ICE)
                    └────────┬────────┘
                             │ media forwarding
                    ┌────────┴────────┐
                    │  livekit-egress  │  Track Egress
                    │  (per-track OGG) │  writes to S3
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │   S3 Storage    │  Garage / MinIO / AWS
                    │ (audio tracks)  │
                    └─────────────────┘
```

Both services share Redis with the existing Reflector stack (same instance, same db).

## Quick Start

### Option 1: Via Setup Script (Recommended)

Pass `--livekit` to the setup script. It generates all credentials and config automatically:

```bash
# First run — --livekit generates credentials and config files
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --livekit --garage --caddy

# Re-runs — LiveKit is auto-detected from existing LIVEKIT_API_KEY in server/.env
./scripts/setup-selfhosted.sh
```

The `--livekit` flag will:
1. Generate `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (random credentials)
2. Set `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`, and storage credentials in `server/.env`
3. Generate `livekit.yaml` and `egress.yaml` config files
4. Set `DEFAULT_VIDEO_PLATFORM=livekit`
5. Enable the `livekit` Docker Compose profile
6. Start `livekit-server` and `livekit-egress` containers

On subsequent re-runs (without flags), the script detects the existing `LIVEKIT_API_KEY` in `server/.env` and re-enables the profile automatically.

### Option 2: Manual Setup

If you prefer manual configuration:

1. **Generate credentials:**

```bash
export LK_KEY="reflector_$(openssl rand -hex 8)"
export LK_SECRET="$(openssl rand -hex 32)"
```

2. **Add to `server/.env`:**

```env
# LiveKit connection
LIVEKIT_URL=ws://livekit-server:7880
LIVEKIT_API_KEY=$LK_KEY
LIVEKIT_API_SECRET=$LK_SECRET
LIVEKIT_PUBLIC_URL=wss://your-domain:7880    # or ws://your-ip:7880

# LiveKit egress S3 storage (reuse transcript storage or configure separately)
LIVEKIT_STORAGE_AWS_BUCKET_NAME=reflector-bucket
LIVEKIT_STORAGE_AWS_REGION=us-east-1
LIVEKIT_STORAGE_AWS_ACCESS_KEY_ID=your-key
LIVEKIT_STORAGE_AWS_SECRET_ACCESS_KEY=your-secret
LIVEKIT_STORAGE_AWS_ENDPOINT_URL=http://garage:3900   # for Garage/MinIO

# Set LiveKit as default platform for new rooms
DEFAULT_VIDEO_PLATFORM=livekit
```

3. **Create `livekit.yaml`:**

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 44200
  port_range_end: 44300
redis:
  address: redis:6379
keys:
  your_api_key: your_api_secret
webhook:
  urls:
    - http://server:1250/v1/livekit/webhook
  api_key: your_api_key
logging:
  level: info
room:
  empty_timeout: 300
  max_participants: 0
```

4. **Create `egress.yaml`:**

```yaml
api_key: your_api_key
api_secret: your_api_secret
ws_url: ws://livekit-server:7880
health_port: 7082
log_level: info
session_limits:
  file_output_max_duration: 4h
```

5. **Start with the livekit profile:**

```bash
docker compose -f docker-compose.selfhosted.yml --profile livekit up -d livekit-server livekit-egress
```

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `LIVEKIT_URL` | Internal WebSocket URL (server -> LiveKit) | `ws://livekit-server:7880` |
| `LIVEKIT_API_KEY` | API key for authentication | `reflector_a1b2c3d4e5f6` |
| `LIVEKIT_API_SECRET` | API secret for token signing and webhooks | `64-char hex string` |

### Recommended

| Variable | Description | Example |
|----------|-------------|---------|
| `LIVEKIT_PUBLIC_URL` | Public WebSocket URL (browser -> LiveKit). **Must be reachable from participants' browsers**, not a Docker-internal address. Without `--domain`, set to `ws://<server-ip>:7880`. With `--domain`, set to `wss://<domain>:7880`. | `wss://reflector.example.com:7880` |
| `LIVEKIT_WEBHOOK_SECRET` | Webhook verification secret. Defaults to `LIVEKIT_API_SECRET` if not set. Only needed if you want a separate secret for webhooks. | (same as API secret) |
| `DEFAULT_VIDEO_PLATFORM` | Default platform for new rooms | `livekit` |

### Storage (for Track Egress)

Track Egress writes per-participant audio files to S3. If not configured, falls back to the transcript storage credentials.

| Variable | Description | Example |
|----------|-------------|---------|
| `LIVEKIT_STORAGE_AWS_BUCKET_NAME` | S3 bucket for egress output | `reflector-bucket` |
| `LIVEKIT_STORAGE_AWS_REGION` | S3 region | `us-east-1` |
| `LIVEKIT_STORAGE_AWS_ACCESS_KEY_ID` | S3 access key | `GK...` |
| `LIVEKIT_STORAGE_AWS_SECRET_ACCESS_KEY` | S3 secret key | `...` |
| `LIVEKIT_STORAGE_AWS_ENDPOINT_URL` | S3 endpoint (for Garage/MinIO) | `http://garage:3900` |

## Docker Compose Services

Two services are added under the `livekit` profile in `docker-compose.selfhosted.yml`:

### livekit-server

| Setting | Value |
|---------|-------|
| Image | `livekit/livekit-server:v1.10.1` |
| Ports | 7880 (signaling), 7881 (TCP RTC), 44200-44300/udp (ICE) |
| Config | `./livekit.yaml` mounted at `/etc/livekit.yaml` |
| Depends on | Redis |

### livekit-egress

| Setting | Value |
|---------|-------|
| Image | `livekit/egress:v1.10.1` |
| Config | `./egress.yaml` mounted at `/etc/egress.yaml` |
| Depends on | Redis, livekit-server |

No `--cap-add=SYS_ADMIN` is needed because Track Egress does not use Chrome (that's only for Room Composite video recording, which we don't use).

## Port Ranges

| Range | Protocol | Service | Notes |
|-------|----------|---------|-------|
| 7880 | TCP | LiveKit signaling | WebSocket connections from browsers (direct, no Caddy) |
| 7881 | TCP | LiveKit RTC over TCP | Fallback when UDP is blocked |
| 44200-44300 | UDP | LiveKit ICE | WebRTC media. Avoids collision with Reflector WebRTC (40000-40100) and macOS ephemeral ports (49152-65535) |

### TLS / Caddy Integration

When `--caddy` is enabled (HTTPS), the setup script automatically:

1. Adds a `/lk-ws` reverse proxy route to the Caddyfile that proxies `wss://domain/lk-ws` → `ws://livekit-server:7880`
2. Sets `LIVEKIT_PUBLIC_URL` to `wss://<domain>/lk-ws` (or `wss://<ip>/lk-ws`)

This avoids mixed-content blocking (browsers reject `ws://` connections on `https://` pages). Caddy handles TLS termination; LiveKit server itself runs plain WebSocket internally.

Without `--caddy`, browsers connect directly to LiveKit on port 7880 via `ws://`.

| Deployment | `LIVEKIT_PUBLIC_URL` | How it works |
|---|---|---|
| localhost, no Caddy | `ws://localhost:7880` | Direct connection |
| LAN IP, no Caddy | `ws://192.168.1.x:7880` | Direct connection |
| IP + Caddy | `wss://192.168.1.x/lk-ws` | Caddy terminates TLS, proxies to LiveKit |
| Domain + Caddy | `wss://example.com/lk-ws` | Caddy terminates TLS, proxies to LiveKit |

## Webhook Endpoint

LiveKit sends webhook events to `POST /v1/livekit/webhook`. Events handled:

| Event | Action |
|-------|--------|
| `participant_joined` | Logs participant join, updates meeting state |
| `participant_left` | Logs participant leave |
| `egress_started` | Logs recording start |
| `egress_ended` | Logs recording completion with output file info |
| `room_started` / `room_finished` | Logs room lifecycle |

Webhooks are authenticated via JWT in the `Authorization` header, verified using the API secret.

## Frontend

The LiveKit room component uses `@livekit/components-react` with the prebuilt `<VideoConference>` UI. It includes:

- Recording consent dialog (same as Daily/Whereby)
- Email transcript button (feature-gated)
- Extensible overlay buttons for custom actions

When a user joins a LiveKit room, the backend generates a JWT access token and returns it in the `room_url` query parameter. The frontend parses this and passes it to the LiveKit React SDK.

## Separate Server Deployment

For larger deployments (15+ participants, multiple simultaneous rooms), LiveKit can run on a dedicated server:

1. Run `livekit-server` and `livekit-egress` on a separate machine
2. Point `LIVEKIT_URL` to the remote LiveKit server (e.g., `ws://livekit-host:7880`)
3. Set `LIVEKIT_PUBLIC_URL` to the public-facing URL (e.g., `wss://livekit.example.com`)
4. Configure the remote LiveKit's `webhook.urls` to point back to the Reflector server
5. Both need access to the same Redis (or configure LiveKit's own Redis)
6. Both need access to the same S3 storage

## Troubleshooting

### LiveKit server not starting

```bash
# Check logs
docker compose -f docker-compose.selfhosted.yml logs livekit-server --tail 30

# Verify config
cat livekit.yaml

# Common issues:
# - Redis not reachable (check redis service is running)
# - Port 7880 already in use
# - Invalid API key format in livekit.yaml
```

### Participants can't connect

```bash
# Check that LIVEKIT_PUBLIC_URL is accessible from the browser
# It must be the URL the browser can reach, not the Docker-internal URL

# Check firewall allows ports 7880, 7881, and 44200-44300/udp
sudo ufw status  # or iptables -L

# Verify the access token is being generated
docker compose -f docker-compose.selfhosted.yml logs server | grep livekit
```

### Track Egress not writing files

```bash
# Check egress logs
docker compose -f docker-compose.selfhosted.yml logs livekit-egress --tail 30

# Verify S3 credentials
# Egress receives S3 config per-request from the server, so check server/.env:
grep LIVEKIT_STORAGE server/.env
```
