# Firewall & Port Requirements

Ports that need to be open on your server firewall, organized by deployment mode.

## With Caddy (--caddy or --ip or --domain)

Caddy acts as the reverse proxy. Most services are only accessible through Caddy on port 443.

| Port | Protocol | Direction | Service | Required? |
|------|----------|-----------|---------|-----------|
| 443 | TCP | Inbound | Caddy HTTPS — web app, API, LiveKit signaling (`/lk-ws`) | Yes |
| 80 | TCP | Inbound | Caddy HTTP — redirects to HTTPS | Yes |
| 44200-44300 | UDP | Inbound | LiveKit WebRTC media (audio/video) | Yes (if LiveKit enabled) |
| 7881 | TCP | Inbound | LiveKit TCP media fallback (when UDP is blocked by client network) | Recommended |
| 8888 | TCP | Inbound | Hatchet dashboard (plain HTTP, no TLS) | Optional (admin only) |

Ports that do NOT need to be open (proxied through Caddy):
- 1250 (backend API)
- 3000 (frontend)
- 7880 (LiveKit signaling — proxied via `/lk-ws`)
- 3900 (Garage S3)

## Without Caddy (direct access)

All services need direct port access. Use this only for local development or trusted networks.

| Port | Protocol | Direction | Service | Required? |
|------|----------|-----------|---------|-----------|
| 3000 | TCP | Inbound | Frontend (Next.js) | Yes |
| 1250 | TCP | Inbound | Backend API (FastAPI) | Yes |
| 7880 | TCP | Inbound | LiveKit signaling (WebSocket) | Yes (if LiveKit enabled) |
| 7881 | TCP | Inbound | LiveKit TCP media fallback | Recommended |
| 44200-44300 | UDP | Inbound | LiveKit WebRTC media | Yes (if LiveKit enabled) |
| 40000-40100 | UDP | Inbound | Reflector WebRTC (browser recording) | Yes (if using browser WebRTC) |
| 3900 | TCP | Inbound | Garage S3 (for presigned URLs in browser) | Yes (if using Garage) |
| 8888 | TCP | Inbound | Hatchet dashboard | Optional |

> **Important:** Without Caddy, all traffic is plain HTTP. Browsers block microphone/camera access on non-HTTPS pages (except `localhost`). Use `--ip` (which implies Caddy) for any non-localhost deployment.

## Internal-Only Ports (never expose)

These ports are used between Docker containers and should NOT be open on the firewall:

| Port | Service | Purpose |
|------|---------|---------|
| 5432 | PostgreSQL | Database |
| 6379 | Redis | Cache + message broker |
| 7077 | Hatchet gRPC | Worker communication |

## Cloud Provider Firewall Examples

### DigitalOcean (with Caddy + LiveKit)

```bash
# Create firewall
doctl compute firewall create \
  --name reflector \
  --inbound-rules "protocol:tcp,ports:443,address:0.0.0.0/0 protocol:tcp,ports:80,address:0.0.0.0/0 protocol:udp,ports:44200-44300,address:0.0.0.0/0 protocol:tcp,ports:7881,address:0.0.0.0/0 protocol:tcp,ports:22,address:0.0.0.0/0" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0 protocol:udp,ports:all,address:0.0.0.0/0" \
  --droplet-ids <DROPLET_ID>
```

### AWS Security Group (with Caddy + LiveKit)

| Type | Port Range | Source | Description |
|------|-----------|--------|-------------|
| HTTPS | 443 | 0.0.0.0/0 | Web app + API + LiveKit signaling |
| HTTP | 80 | 0.0.0.0/0 | Redirect to HTTPS |
| Custom UDP | 44200-44300 | 0.0.0.0/0 | LiveKit WebRTC media |
| Custom TCP | 7881 | 0.0.0.0/0 | LiveKit TCP fallback |
| SSH | 22 | Your IP | Admin access |

### Ubuntu UFW (with Caddy + LiveKit)

```bash
sudo ufw allow 443/tcp    # Caddy HTTPS
sudo ufw allow 80/tcp     # HTTP redirect
sudo ufw allow 7881/tcp   # LiveKit TCP fallback
sudo ufw allow 44200:44300/udp  # LiveKit WebRTC media
sudo ufw allow 22/tcp     # SSH
sudo ufw enable
```

## Port Ranges Explained

### Why 44200-44300 for LiveKit?

LiveKit's WebRTC ICE candidates use UDP. The port range was chosen to avoid collisions:
- **40000-40100** — Reflector's own WebRTC (browser recording)
- **44200-44300** — LiveKit WebRTC
- **49152-65535** — macOS ephemeral ports (reserved by OS)

The range is configurable in `livekit.yaml` under `rtc.port_range_start` / `rtc.port_range_end`. If changed, update `docker-compose.selfhosted.yml` port mapping to match.

### Why 101 ports?

100 UDP ports support ~100 concurrent WebRTC connections (roughly 50 participants with audio + video). For larger deployments, increase the range in both `livekit.yaml` and `docker-compose.selfhosted.yml`.
