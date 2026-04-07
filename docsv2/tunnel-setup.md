# Tunnel Setup (Self-Hosting Behind NAT)

Expose your self-hosted Reflector + LiveKit stack to the internet without port forwarding, static IPs, or cloud VMs using tunneling services.

## Requirements

You need **two tunnels**:

| Tunnel | Protocol | What it carries | Local port | Examples |
|--------|----------|----------------|------------|----------|
| **TCP tunnel** | TCP | Web app, API, LiveKit signaling (WebSocket) | 443 (Caddy) | playit.gg, ngrok, Cloudflare Tunnel, bore, frp |
| **UDP tunnel** | UDP | WebRTC audio/video media | Assigned by tunnel service | playit.gg, frp |

> **Important:** Most tunneling services only support TCP. WebRTC media requires UDP. Make sure your chosen service supports UDP tunnels. As of writing, [playit.gg](https://playit.gg) is one of the few that supports both TCP and UDP (premium $3/mo).

## Architecture

```
Internet participants
    │
    ├── TCP tunnel (HTTPS)
    │   └── tunnel service → your machine port 443 (Caddy)
    │       ├── /v1/*          → server:1250 (API)
    │       ├── /lk-ws/*       → livekit-server:7880 (signaling)
    │       └── /*             → web:3000 (frontend)
    │
    └── UDP tunnel
        └── tunnel service → your machine port N (LiveKit ICE)
```

## Setup

### Step 1: Create tunnels with your chosen service

Create two tunnels and note the public addresses:

- **TCP tunnel**: Points to your local port `443`
  - You'll get an address like `your-tunnel.example.com:PORT`
- **UDP tunnel**: Points to a local port (e.g., `14139`)
  - You'll get an address like `udp-host.example.com:PORT`
  - **The local port must match the public port** (or LiveKit ICE candidates won't match). Set the local port to the same number as the public port assigned by the tunnel service.

### Step 2: Run the setup script

```bash
./scripts/setup-selfhosted.sh <mode> --livekit --garage \
  --tunnels <TCP_ADDRESS>,<UDP_ADDRESS>
```

Example:
```bash
./scripts/setup-selfhosted.sh --cpu --livekit --garage \
  --tunnels my-tunnel.example.com:9055,udp-host.example.com:14139
```

Or use separate flags:
```bash
./scripts/setup-selfhosted.sh --cpu --livekit --garage \
  --tunnel-tcp my-tunnel.example.com:9055 \
  --tunnel-udp udp-host.example.com:14139
```

The script automatically:
- Sets all URLs (API, frontend, LiveKit signaling) to the TCP tunnel address
- Configures LiveKit with the UDP tunnel port and resolved IP for ICE candidates
- Enables Caddy with self-signed TLS (catch-all on port 443)
- Saves tunnel config for re-runs

### Step 3: Start the tunnel agent

Run your tunneling service's agent/client on the same machine. It must be running whenever you want external access.

### Step 4: Access

Share `https://<TCP_TUNNEL_ADDRESS>` with participants. They'll need to accept the self-signed certificate warning in their browser.

## Flag Reference

| Flag | Description |
|------|-------------|
| `--tunnels TCP,UDP` | Both tunnel addresses comma-separated (e.g., `host:9055,host:14139`) |
| `--tunnel-tcp ADDR` | TCP tunnel address only (e.g., `host.example.com:9055`) |
| `--tunnel-udp ADDR` | UDP tunnel address only (e.g., `host.example.com:14139`) |

Tunnel flags:
- Imply `--caddy` (HTTPS required for browser mic/camera access)
- Are mutually exclusive with `--ip` and `--domain`
- Are saved to config memory (re-run without flags replays saved config)

## UDP Port Matching

LiveKit advertises ICE candidates with a specific IP and port. The browser connects to that exact address. If the tunnel's public port differs from the local port, ICE will fail.

**Correct setup:** Set the tunnel's local port to match its public port.

```
Tunnel assigns public port 14139
  → Set local port to 14139
  → LiveKit listens on 14139 (udp_port in livekit.yaml)
  → Docker maps 14139:14139/udp
  → ICE candidates advertise tunnel_ip:14139
  → Browser connects to tunnel_ip:14139 → tunnel → local:14139 → LiveKit
```

If your tunneling service doesn't let you choose the local port, you'll need to update `livekit.yaml` manually with the assigned ports.

## TLS Certificate Warning

With tunnel services on non-standard ports (e.g., `:9055`), Let's Encrypt can't auto-provision certificates (it requires ports 80/443). Caddy uses `tls internal` which generates a self-signed certificate. Participants will see a browser warning they must accept.

**To avoid the warning:**
- Use a tunnel service that provides port 443 for TCP
- Or use a real domain with `--domain` on a server with a public IP

## Compatible Tunnel Services

| Service | TCP | UDP | Free tier | Notes |
|---------|-----|-----|-----------|-------|
| [playit.gg](https://playit.gg) | Yes (premium) | Yes (premium) | Limited | $3/mo premium. Supports both TCP + UDP. |
| [ngrok](https://ngrok.com) | Yes | No | Limited | TCP only — needs a separate UDP tunnel for media |
| [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) | Yes | No | Yes | TCP only — needs a separate UDP tunnel for media |
| [bore](https://github.com/ekzhang/bore) | Yes | No | Self-hosted | TCP only |
| [frp](https://github.com/fatedier/frp) | Yes | Yes | Self-hosted | Requires your own VPS to run the frp server |
| [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) | Yes | No | Free (3 nodes) | TCP only, requires Tailscale account |

For a full self-contained setup without a VPS, playit.gg (TCP + UDP) is currently the simplest option.

## Limitations

- **Latency**: Adds a hop through the tunnel service's relay servers
- **Bandwidth**: Tunnel services may have bandwidth limits on free/cheap tiers
- **Reliability**: Depends on the tunnel service's uptime
- **Certificate warning**: Unavoidable with non-standard ports (see above)
- **Single UDP port**: Tunnel mode uses a single UDP port instead of a range, which limits concurrent WebRTC connections (~50 participants max)
- **Not production-grade**: Suitable for demos, small teams, development, and privacy-first setups. For production, use a server with a public IP.

## Comparison

| Approach | Cost | Setup | Data location | Port forwarding needed |
|----------|------|-------|---------------|----------------------|
| **Tunnel (this guide)** | $0-3/mo | Low | Your machine | No |
| **Cloud VM** | $5-20/mo | Low | Cloud provider | No |
| **Port forwarding** | $0 | Medium | Your machine | Yes (router config) |
| **VPN mesh (Tailscale)** | $0 | Low | Your machine | No (VPN peers only) |
