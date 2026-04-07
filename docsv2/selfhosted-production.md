# Self-Hosted Production Deployment

Deploy Reflector on a single server with everything running in Docker. Transcription, diarization, and translation use specialized ML models (Whisper/Parakeet, Pyannote); only summarization and topic detection require an LLM.

> For a detailed walkthrough of how the setup script and infrastructure work under the hood, see [How the Self-Hosted Setup Works](selfhosted-architecture.md).

## Prerequisites

### Hardware
- **With GPU**: Linux server with NVIDIA GPU (8GB+ VRAM recommended), 16GB+ RAM, 50GB+ disk
- **CPU-only**: 8+ cores, 32GB+ RAM (transcription is slower but works)
- Disk space for ML models (~2GB on first run) + audio storage

### Software
- Docker Engine 24+ with Compose V2
- NVIDIA drivers + `nvidia-container-toolkit` (GPU modes only)
- `curl`, `openssl` (usually pre-installed)

### Accounts & Credentials (depending on options)

**Always recommended:**
- **HuggingFace token** — For downloading pyannote speaker diarization models. Get one at https://huggingface.co/settings/tokens and accept the model licenses:
  - https://huggingface.co/pyannote/speaker-diarization-3.1
  - https://huggingface.co/pyannote/segmentation-3.0
  - The setup script will prompt for this. If skipped, diarization falls back to a public model bundle (may be less reliable).

**LLM for summarization & topic detection (pick one):**
- **With `--ollama-gpu` or `--ollama-cpu`**: Nothing extra — Ollama runs locally and pulls the model automatically
- **Without `--ollama-*`**: An OpenAI-compatible LLM API key and endpoint. Examples:
  - OpenAI: `LLM_URL=https://api.openai.com/v1`, `LLM_API_KEY=sk-...`, `LLM_MODEL=gpt-4o-mini`
  - Anthropic, Together, Groq, or any OpenAI-compatible API
  - A self-managed vLLM or Ollama instance elsewhere on the network

**Object storage (pick one):**
- **With `--garage`**: Nothing extra — Garage (local S3-compatible storage) is auto-configured by the script
- **Without `--garage`**: S3-compatible storage credentials. The script will prompt for these, or you can pre-fill `server/.env`. Options include:
  - **AWS S3**: Access Key ID, Secret Access Key, bucket name, region
  - **MinIO**: Same credentials + `TRANSCRIPT_STORAGE_AWS_ENDPOINT_URL=http://your-minio:9000`
  - **Any S3-compatible provider** (Backblaze B2, Cloudflare R2, DigitalOcean Spaces, etc.): same fields + custom endpoint URL

**Optional add-ons (configure after initial setup):**
- **Authentik** (user authentication): Requires an Authentik instance with an OAuth2/OIDC application configured for Reflector. See [Enabling Authentication](#enabling-authentication-authentik) below.

## Quick Start

```bash
git clone https://github.com/Monadical-SAS/reflector.git
cd reflector

# GPU + local Ollama LLM + local Garage storage + Caddy SSL (with domain):
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy --domain reflector.example.com

# Same but without a domain (self-signed cert, access via IP):
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy

# CPU-only (in-process ML, no GPU container):
./scripts/setup-selfhosted.sh --cpu --ollama-cpu --garage --caddy

# Remote GPU service (your own hosted GPU, no local ML container):
./scripts/setup-selfhosted.sh --hosted --garage --caddy

# With password authentication (single admin user):
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy --password mysecretpass

# Build from source instead of pulling prebuilt images:
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy --build
```

That's it. The script generates env files, secrets, starts all containers, waits for health checks, and prints the URL.

## ML Processing Modes (Required)

Pick `--gpu`, `--cpu`, or `--hosted`. This determines how **transcription, diarization, translation, audio padding, and audio mixdown** run:

| Flag | What it does | Requires |
|------|-------------|----------|
| `--gpu` | NVIDIA GPU container for ML models | NVIDIA GPU + drivers + `nvidia-container-toolkit` |
| `--cpu` | In-process CPU processing on server/worker (no ML container) | 8+ cores, 16GB+ RAM (32GB recommended for large files) |
| `--hosted` | Remote GPU service URL (no local ML container) | A running GPU service instance (e.g. `gpu/self_hosted/`) |

## Local LLM (Optional)

Optionally add `--ollama-gpu` or `--ollama-cpu` for a **local Ollama instance** that handles summarization and topic detection. If omitted, configure an external OpenAI-compatible LLM in `server/.env`.

| Flag | What it does | Requires |
|------|-------------|----------|
| `--ollama-gpu` | Local Ollama with NVIDIA GPU acceleration | NVIDIA GPU |
| `--ollama-cpu` | Local Ollama on CPU only | Nothing extra |
| `--llm-model MODEL` | Choose which Ollama model to download (default: `qwen2.5:14b`) | `--ollama-gpu` or `--ollama-cpu` |
| *(omitted)* | User configures external LLM (OpenAI, Anthropic, etc.) | LLM API key |

### macOS / Apple Silicon

`--ollama-gpu` requires an NVIDIA GPU and **does not work on macOS**. Docker on macOS cannot access Apple GPU acceleration, so the containerized Ollama will run on CPU only regardless of the flag used.

For the best performance on Mac, we recommend running Ollama **natively outside Docker** (install from https://ollama.com) — this gives Ollama direct access to Apple Metal GPU acceleration. Then omit `--ollama-gpu`/`--ollama-cpu` from the setup script and point the backend to your local Ollama instance:

```env
# In server/.env
LLM_URL=http://host.docker.internal:11434/v1
LLM_MODEL=qwen2.5:14b
LLM_API_KEY=not-needed
```

`--ollama-cpu` does work on macOS but will be significantly slower than a native Ollama install with Metal acceleration.

### Choosing an Ollama model

The default model is `qwen2.5:14b` (~9GB download, good multilingual support and summary quality). Override with `--llm-model`:

```bash
# Default (qwen2.5:14b)
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy

# Mistral — good balance of speed and quality (~4.1GB)
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --llm-model mistral --garage --caddy

# Phi-4 — smaller and faster (~9.1GB)
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --llm-model phi4 --garage --caddy

# Llama 3.3 70B — best quality, needs 48GB+ RAM or GPU VRAM (~43GB)
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --llm-model llama3.3:70b --garage --caddy

# Gemma 2 9B (~5.4GB)
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --llm-model gemma2 --garage --caddy

# DeepSeek R1 8B — reasoning model, verbose but thorough summaries (~4.9GB)
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --llm-model deepseek-r1:8b --garage --caddy
```

Browse all available models at https://ollama.com/library.

### Recommended combinations

- **`--gpu --ollama-gpu`**: Best for servers with NVIDIA GPU. Fully self-contained, no external API keys needed.
- **`--cpu --ollama-cpu`**: No GPU available but want everything self-contained. Slower but works.
- **`--hosted --ollama-cpu`**: Remote GPU for ML, local CPU for LLM. Great when you have a separate GPU server.
- **`--gpu --ollama-cpu`**: GPU for transcription, CPU for LLM. Saves GPU VRAM for ML models.
- **`--gpu`**: Have NVIDIA GPU but prefer a cloud LLM (faster/better summaries with GPT-4, Claude, etc.).
- **`--cpu`**: No GPU, prefer cloud LLM. Slowest transcription but best summary quality.
- **`--hosted`**: Remote GPU, cloud LLM. No local ML at all.

## Other Optional Flags

| Flag | What it does |
|------|-------------|
| `--livekit` | Enables LiveKit self-hosted video platform. Generates API credentials, starts `livekit-server` + `livekit-egress`. See [LiveKit Setup](livekit-setup.md). |
| `--garage` | Starts Garage (local S3-compatible storage). Auto-configures bucket, keys, and env vars. |
| `--caddy` | Starts Caddy reverse proxy on ports 80/443 with self-signed cert. |
| `--domain DOMAIN` | Use a real domain with Let's Encrypt auto-HTTPS (implies `--caddy`). Requires DNS A record pointing to this server and ports 80/443 open. |
| `--password PASS` | Enable password authentication with an `admin@localhost` user. Sets `AUTH_BACKEND=password`, `PUBLIC_MODE=false`. See [Enabling Password Authentication](#enabling-password-authentication). |
| `--build` | Build backend (server, worker, beat) and frontend (web) Docker images from source instead of pulling prebuilt images from the registry. Useful for development or when running a version with local changes. |

Without `--garage`, you **must** provide S3-compatible credentials (the script will prompt interactively or you can pre-fill `server/.env`).

Without `--caddy` or `--domain`, no ports are exposed. Point your own reverse proxy at `web:3000` (frontend) and `server:1250` (API).

## Video Platform (LiveKit)

For self-hosted video rooms with per-participant audio recording, add `--livekit` to your setup command:

```bash
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --livekit --garage --caddy
```

This generates LiveKit API credentials, creates config files (`livekit.yaml`, `egress.yaml`), and starts `livekit-server` (WebRTC SFU) + `livekit-egress` (per-participant audio recording to S3). LiveKit reuses the same Redis and S3 storage as the rest of the stack.

New rooms default to LiveKit when `DEFAULT_VIDEO_PLATFORM=livekit` is set (done automatically by the setup script). Existing Daily.co and Whereby rooms continue to work. On re-runs, the script detects the existing `LIVEKIT_API_KEY` in `server/.env` automatically.

> For detailed configuration, environment variables, ports, and troubleshooting, see [LiveKit Setup](livekit-setup.md).

**Using a domain (recommended for production):** Point a DNS A record at your server's IP, then pass `--domain your.domain.com`. Caddy will automatically obtain and renew a Let's Encrypt certificate. Ports 80 and 443 must be open.

**Without a domain:** `--caddy` alone uses a self-signed certificate. Browsers will show a security warning that must be accepted.

## Per-Service Backend Overrides

Override individual ML services without changing the base mode. Useful when you want most services on one backend but need specific services on another.

| Flag | Valid backends | Default (`--gpu`/`--hosted`) | Default (`--cpu`) |
|------|---------------|------------------------------|-------------------|
| `--transcript BACKEND` | `whisper`, `modal` | `modal` | `whisper` |
| `--diarization BACKEND` | `pyannote`, `modal` | `modal` | `pyannote` |
| `--translation BACKEND` | `marian`, `modal`, `passthrough` | `modal` | `marian` |
| `--padding BACKEND` | `pyav`, `modal` | `modal` | `pyav` |
| `--mixdown BACKEND` | `pyav`, `modal` | `modal` | `pyav` |

**Examples:**

```bash
# CPU base, but use a remote modal service for padding only
./scripts/setup-selfhosted.sh --cpu --padding modal --garage --caddy

# GPU base, but skip translation entirely (passthrough)
./scripts/setup-selfhosted.sh --gpu --translation passthrough --garage --caddy

# CPU base with remote modal diarization and translation
./scripts/setup-selfhosted.sh --cpu --diarization modal --translation modal --garage
```

When overriding a service to `modal` in `--cpu` mode, the script will warn you to configure the service URL (`TRANSCRIPT_URL` etc.) in `server/.env` to point to your GPU service, then re-run.

When overriding a service to a CPU backend (e.g., `--transcript whisper`) in `--gpu` mode, that service runs in-process on the server/worker containers while the GPU container still serves the remaining `modal` services.

## Config Memory (No-Flag Re-run)

After a successful run, the script saves your CLI arguments to `data/.selfhosted-last-args`. On subsequent runs with no arguments, the saved configuration is automatically replayed:

```bash
# First run — saves the config
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy

# Later re-runs — same config, no flags needed
./scripts/setup-selfhosted.sh
# => "No flags provided — replaying saved configuration:"
# => "  --gpu --ollama-gpu --garage --caddy"
```

To change the configuration, pass new flags — they override and replace the saved config:

```bash
# Switch to CPU mode with overrides — this becomes the new saved config
./scripts/setup-selfhosted.sh --cpu --padding modal --garage --caddy
```

## What the Script Does

1. **Prerequisites check** — Docker, NVIDIA GPU (if needed), compose file exists
2. **Generate secrets** — `SECRET_KEY`, `NEXTAUTH_SECRET` via `openssl rand`
3. **Generate `server/.env`** — From template, sets infrastructure defaults, configures LLM based on mode, enables `PUBLIC_MODE`
4. **Generate `www/.env`** — Auto-detects server IP, sets URLs
5. **Storage setup** — Either initializes Garage (bucket, keys, permissions) or prompts for external S3 credentials
6. **Caddyfile** — Generates domain-specific (Let's Encrypt) or IP-specific (self-signed) configuration
7. **Build & start** — For `--gpu`, builds the GPU model image from source. For `--cpu` and `--hosted`, no ML container is built. With `--build`, also builds backend and frontend from source; otherwise pulls prebuilt images from the registry
8. **Auto-detects video platforms** — If `DAILY_API_KEY` is found in `server/.env`, generates `.env.hatchet` (dashboard URL/cookie config), starts Hatchet workflow engine, and generates an API token. If any video platform is configured, enables the Rooms feature
9. **Health checks** — Waits for each service, pulls Ollama model if needed, warns about missing LLM config

> For a deeper dive into each step, see [How the Self-Hosted Setup Works](selfhosted-architecture.md).

## Configuration Reference

### Server Environment (`server/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | Auto-set (Docker internal) |
| `REDIS_HOST` | Redis hostname | Auto-set (`redis`) |
| `SECRET_KEY` | App secret | Auto-generated |
| `AUTH_BACKEND` | Authentication method (`none`, `password`, `jwt`) | `none` |
| `PUBLIC_MODE` | Allow unauthenticated access | `true` |
| `ADMIN_EMAIL` | Admin email for password auth | *(unset)* |
| `ADMIN_PASSWORD_HASH` | PBKDF2 hash for password auth | *(unset)* |
| `WEBRTC_HOST` | IP advertised in WebRTC ICE candidates | Auto-detected (server IP) |
| `TRANSCRIPT_URL` | Specialized model endpoint | `http://transcription:8000` |
| `PADDING_BACKEND` | Audio padding backend (`pyav` or `modal`) | `modal` (selfhosted), `pyav` (default) |
| `PADDING_URL` | Audio padding endpoint (when `PADDING_BACKEND=modal`) | `http://transcription:8000` |
| `MIXDOWN_BACKEND` | Audio mixdown backend (`pyav` or `modal`) | `modal` (selfhosted), `pyav` (default) |
| `MIXDOWN_URL` | Audio mixdown endpoint (when `MIXDOWN_BACKEND=modal`) | `http://transcription:8000` |
| `LLM_URL` | OpenAI-compatible LLM endpoint | Auto-set for Ollama modes |
| `LLM_API_KEY` | LLM API key | `not-needed` for Ollama |
| `LLM_MODEL` | LLM model name | `qwen2.5:14b` for Ollama (override with `--llm-model`) |
| `CELERY_BEAT_POLL_INTERVAL` | Override all worker polling intervals (seconds). `0` = use individual defaults | `300` (selfhosted), `0` (other) |
| `TRANSCRIPT_STORAGE_BACKEND` | Storage backend | `aws` |
| `TRANSCRIPT_STORAGE_AWS_*` | S3 credentials | Auto-set for Garage |
| `DAILY_API_KEY` | Daily.co API key (enables live rooms) | *(unset)* |
| `DAILY_SUBDOMAIN` | Daily.co subdomain | *(unset)* |
| `DAILYCO_STORAGE_AWS_ACCESS_KEY_ID` | AWS access key for reading Daily's recording bucket | *(unset)* |
| `DAILYCO_STORAGE_AWS_SECRET_ACCESS_KEY` | AWS secret key for reading Daily's recording bucket | *(unset)* |
| `ZULIP_REALM` | Zulip server hostname (e.g. `zulip.example.com`) | *(unset)* |
| `ZULIP_API_KEY` | Zulip bot API key | *(unset)* |
| `ZULIP_BOT_EMAIL` | Zulip bot email address | *(unset)* |
| `ZULIP_DAG_STREAM` | Zulip stream for pipeline failure alerts | *(unset)* |
| `ZULIP_DAG_TOPIC` | Zulip topic for pipeline failure alerts | *(unset)* |
| `HATCHET_CLIENT_TOKEN` | Hatchet API token (auto-generated) | *(unset)* |
| `HATCHET_CLIENT_SERVER_URL` | Hatchet server URL | Auto-set when Daily.co configured |
| `HATCHET_CLIENT_HOST_PORT` | Hatchet gRPC address | Auto-set when Daily.co configured |
| `TRANSCRIPT_FILE_TIMEOUT` | HTTP timeout (seconds) for file transcription requests | `600` (`3600` in CPU mode) |
| `DIARIZATION_FILE_TIMEOUT` | HTTP timeout (seconds) for file diarization requests | `600` (`3600` in CPU mode) |

### Frontend Environment (`www/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `SITE_URL` | Public-facing URL | Auto-detected |
| `API_URL` | API URL (browser-side) | Same as SITE_URL |
| `SERVER_API_URL` | API URL (server-side) | `http://server:1250` |
| `NEXTAUTH_SECRET` | Auth secret | Auto-generated |
| `FEATURE_REQUIRE_LOGIN` | Require authentication | `false` |
| `AUTH_PROVIDER` | Auth provider (`authentik` or `credentials`) | *(unset)* |
| `FEATURE_ROOMS` | Enable meeting rooms UI | Auto-set when video platform configured |

## Storage Options

### Garage (Recommended for Self-Hosted)

Use `--garage` flag. The script automatically:
- Generates `data/garage.toml` with a random RPC secret
- Starts the Garage container
- Creates the `reflector-media` bucket
- Creates an access key with read/write permissions
- Writes all S3 credentials to `server/.env`

### External S3 (AWS, MinIO, etc.)

Don't use `--garage`. The script will prompt for:
- Access Key ID
- Secret Access Key
- Bucket Name
- Region
- Endpoint URL (for non-AWS like MinIO)

Or pre-fill in `server/.env`:
```env
TRANSCRIPT_STORAGE_BACKEND=aws
TRANSCRIPT_STORAGE_AWS_ACCESS_KEY_ID=your-key
TRANSCRIPT_STORAGE_AWS_SECRET_ACCESS_KEY=your-secret
TRANSCRIPT_STORAGE_AWS_BUCKET_NAME=reflector-media
TRANSCRIPT_STORAGE_AWS_REGION=us-east-1
# For non-AWS S3 (MinIO, etc.):
TRANSCRIPT_STORAGE_AWS_ENDPOINT_URL=http://minio:9000
```

### S3 IAM Permissions Reference

Reflector uses up to 3 separate S3 credential sets, each scoped to a specific bucket. When using AWS IAM in production, each key should have only the permissions it needs.

**Transcript storage key** (`TRANSCRIPT_STORAGE_AWS_*`) — the main bucket for processed files:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
  "Resource": ["arn:aws:s3:::reflector-media/*", "arn:aws:s3:::reflector-media"]
}
```

Used for: processed MP3 audio, waveform JSON, temporary pipeline files. Deletions happen during trash "Destroy", consent-denied cleanup, and public mode data retention.

**Daily.co worker key** (`DAILYCO_STORAGE_AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEY`) — for reading and cleaning up Daily recordings:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
  "Resource": ["arn:aws:s3:::your-daily-bucket/*", "arn:aws:s3:::your-daily-bucket"]
}
```

Used for: downloading multitrack recording files for processing, deleting track files and composed video on consent denial or trash destroy. No `s3:PutObject` needed — Daily's own API writes via the Role ARN.

**Whereby worker key** (`WHEREBY_STORAGE_AWS_ACCESS_KEY_ID/SECRET_ACCESS_KEY`) — same pattern as Daily:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
  "Resource": ["arn:aws:s3:::your-whereby-bucket/*", "arn:aws:s3:::your-whereby-bucket"]
}
```

> **Fallback behavior:** If platform-specific worker keys are not set, Reflector falls back to the transcript storage master key with a bucket override. This means the master key would need cross-bucket access to the Daily/Whereby buckets. For least-privilege, configure platform-specific keys so each only accesses its own bucket.

> **Garage / single-bucket setups:** When using Garage or a single S3 bucket for everything, one master key with full permissions on that bucket is sufficient. The IAM scoping above only matters when using separate buckets per platform (typical in AWS production).

## What Authentication Enables

By default, Reflector runs in **public mode** (`AUTH_BACKEND=none`, `PUBLIC_MODE=true`) — anyone can create and view transcripts without logging in. Transcripts are anonymous (not linked to any user) and cannot be edited or deleted after creation.

Enabling authentication (either password or Authentik) unlocks:

| Feature | Public mode (no auth) | With authentication |
|---------|----------------------|---------------------|
| Create transcripts (record/upload) | Yes (anonymous, unowned) | Yes (owned by user) |
| View transcripts | All transcripts visible | Own transcripts + shared rooms |
| Edit/delete transcripts | No | Yes (owner only) |
| Privacy controls (private/semi-private/public) | No (everything public) | Yes (owner can set share mode) |
| Speaker reassignment and merging | No | Yes (owner only) |
| Participant management (add/edit/delete) | Read-only | Full CRUD (owner only) |
| Create rooms | No | Yes |
| Edit/delete rooms | No | Yes (owner only) |
| Room calendar (ICS) sync | No | Yes (owner only) |
| API key management | No | Yes |
| Post to Zulip | No | Yes (owner only) |
| Real-time WebSocket notifications | No (connection closed) | Yes (transcript create/delete events) |
| Meeting host access (Daily.co token) | No | Yes (room owner) |

In short: public mode is "demo-friendly" — great for trying Reflector out. Authentication adds **ownership, privacy, and management** of your data.

## Authentication Options

Reflector supports three authentication backends:

| Backend | `AUTH_BACKEND` | Use case |
|---------|---------------|----------|
| `none` | `none` | Public/demo mode, no login required |
| `password` | `password` | Single-user self-hosted, simple email/password login |
| `jwt` | `jwt` | Multi-user via Authentik (OAuth2/OIDC) |

## Enabling Password Authentication

The simplest way to add authentication. Creates a single admin user with email/password login — no external identity provider needed.

### Quick setup (recommended)

Pass `--password` to the setup script:

```bash
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy --password mysecretpass
```

This automatically:
- Sets `AUTH_BACKEND=password` and `PUBLIC_MODE=false` in `server/.env`
- Creates an `admin@localhost` user with the given password
- Sets `FEATURE_REQUIRE_LOGIN=true` and `AUTH_PROVIDER=credentials` in `www/.env`
- Provisions the admin user in the database on container startup

### Manual setup

If you prefer to configure manually or want to change the admin email:

1. Generate a password hash:
   ```bash
   cd server
   uv run python -m reflector.tools.create_admin --hash-only --password yourpassword
   ```

2. Update `server/.env`:
   ```env
   AUTH_BACKEND=password
   PUBLIC_MODE=false
   ADMIN_EMAIL=admin@yourdomain.com
   ADMIN_PASSWORD_HASH=pbkdf2:sha256:100000$<salt>$<hash>
   ```

3. Update `www/.env`:
   ```env
   FEATURE_REQUIRE_LOGIN=true
   AUTH_PROVIDER=credentials
   ```

4. Restart:
   ```bash
   docker compose -f docker-compose.selfhosted.yml down
   ./scripts/setup-selfhosted.sh <same-flags>
   ```

### How it works

- The backend issues HS256 JWTs (signed with `SECRET_KEY`) on successful login via `POST /v1/auth/login`
- Tokens expire after 24 hours; the user must log in again after expiry
- The frontend shows a login page at `/login` with email and password fields
- A rate limiter blocks IPs after 10 failed login attempts within 5 minutes
- The admin user is provisioned automatically on container startup from `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` environment variables
- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations) — no additional dependencies required

### Changing the admin password

```bash
cd server
uv run python -m reflector.tools.create_admin --email admin@localhost --password newpassword
```

Or update `ADMIN_PASSWORD_HASH` in `server/.env` and restart the containers.

## Enabling Authentication (Authentik)

For multi-user deployments with SSO. Requires an external Authentik instance.

By default, authentication is disabled (`AUTH_BACKEND=none`, `FEATURE_REQUIRE_LOGIN=false`). To enable:

1. Deploy an Authentik instance (see [Authentik docs](https://goauthentik.io/docs/installation))
2. Create an OAuth2/OIDC application for Reflector
3. Update `server/.env`:
   ```env
   AUTH_BACKEND=jwt
   AUTH_JWT_AUDIENCE=your-client-id
   ```
4. Update `www/.env`:
   ```env
   FEATURE_REQUIRE_LOGIN=true
   AUTH_PROVIDER=authentik
   AUTHENTIK_ISSUER=https://authentik.example.com/application/o/reflector
   AUTHENTIK_REFRESH_TOKEN_URL=https://authentik.example.com/application/o/token/
   AUTHENTIK_CLIENT_ID=your-client-id
   AUTHENTIK_CLIENT_SECRET=your-client-secret
   ```
5. Restart: `docker compose -f docker-compose.selfhosted.yml down && ./scripts/setup-selfhosted.sh <same-flags>`

## Enabling Daily.co Live Rooms

Daily.co enables real-time meeting rooms with automatic recording and per-participant
audio tracks for improved diarization. When configured, the setup script automatically
starts the Hatchet workflow engine for multitrack recording processing.

### Prerequisites

- **Daily.co account** — Sign up at https://www.daily.co/
- **API key** — From Daily.co Dashboard → Developers → API Keys
- **Subdomain** — The `yourname` part of `yourname.daily.co`
- **AWS S3 bucket** — For Daily.co to store recordings. See [Daily.co recording storage docs](https://docs.daily.co/guides/products/live-streaming-recording/storing-recordings-in-a-custom-s3-bucket)
- **IAM role ARN** — An AWS IAM role that Daily.co assumes to write recordings to your bucket

### Setup

1. Configure Daily.co env vars in `server/.env` **before** running the setup script:

   ```env
   DAILY_API_KEY=your-daily-api-key
   DAILY_SUBDOMAIN=your-subdomain
   DEFAULT_VIDEO_PLATFORM=daily
   DAILYCO_STORAGE_AWS_BUCKET_NAME=your-recordings-bucket
   DAILYCO_STORAGE_AWS_REGION=us-east-1
   DAILYCO_STORAGE_AWS_ROLE_ARN=arn:aws:iam::123456789:role/DailyCoAccess
   # Worker credentials for reading/deleting recordings from Daily's S3 bucket.
   # Required when transcript storage is separate from Daily's bucket
   # (e.g., selfhosted with Garage or a different S3 account).
   DAILYCO_STORAGE_AWS_ACCESS_KEY_ID=your-aws-access-key
   DAILYCO_STORAGE_AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   ```

   > **Important:** The `DAILYCO_STORAGE_AWS_ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` are AWS IAM
   > credentials that allow the Hatchet workers to **read and delete** recording files from Daily's
   > S3 bucket. These are separate from the `ROLE_ARN` (which Daily's API uses to *write* recordings).
   > Without these keys, multitrack processing will fail with 404 errors when transcript storage
   > (e.g., Garage) uses different credentials than the Daily recording bucket.

2. Run the setup script as normal:

   ```bash
   ./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy
   ```

   The script detects `DAILY_API_KEY` and automatically:
   - Starts the Hatchet workflow engine (`hatchet` container)
   - Starts Hatchet CPU and LLM workers (`hatchet-worker-cpu`, `hatchet-worker-llm`)
   - Generates a `HATCHET_CLIENT_TOKEN` and saves it to `server/.env`
   - Sets `HATCHET_CLIENT_SERVER_URL` and `HATCHET_CLIENT_HOST_PORT`
   - Enables `FEATURE_ROOMS=true` in `www/.env`
   - Registers Daily.co beat tasks (recording polling, presence reconciliation)

3. (Optional) For faster recording discovery, configure a Daily.co webhook:
   - In the Daily.co dashboard, add a webhook pointing to `https://your-domain/v1/daily/webhook`
   - Set `DAILY_WEBHOOK_SECRET` in `server/.env` (the signing secret from Daily.co)
   - Without webhooks, the system polls the Daily.co API every 15 seconds

### What Gets Started

| Service | Purpose |
|---------|---------|
| `hatchet` | Workflow orchestration engine (manages multitrack processing pipelines) |
| `hatchet-worker-cpu` | CPU-heavy audio tasks (track mixdown, waveform generation) |
| `hatchet-worker-llm` | Transcription, LLM inference (summaries, topics, titles), orchestration |

### Hatchet Dashboard

The Hatchet workflow engine includes a web dashboard for monitoring workflow runs and debugging. The setup script auto-generates `.env.hatchet` at the project root with the dashboard URL and cookie domain configuration. This file is git-ignored.

- **With Caddy**: Accessible at `https://your-domain:8888` (TLS via Caddy)
- **Without Caddy**: Accessible at `http://your-ip:8888` (direct port mapping)

### Conditional Beat Tasks

Beat tasks are registered based on which services are configured:

- **Whereby tasks** (only if `WHEREBY_API_KEY` or `AWS_PROCESS_RECORDING_QUEUE_URL`): `process_messages`, `reprocess_failed_recordings`
- **Daily.co tasks** (only if `DAILY_API_KEY`): `poll_daily_recordings`, `trigger_daily_reconciliation`, `reprocess_failed_daily_recordings`
- **Platform tasks** (if any video platform configured): `process_meetings`, `sync_all_ics_calendars`, `create_upcoming_meetings`
- **Always registered**: `cleanup_old_public_data` (if `PUBLIC_MODE`), `healthcheck_ping` (if `HEALTHCHECK_URL`)

## Enabling Real Domain with Let's Encrypt

By default, Caddy uses self-signed certificates. For a real domain:

1. Point your domain's DNS to your server's IP
2. Ensure ports 80 and 443 are open
3. Edit `Caddyfile`:
   ```
   reflector.example.com {
       handle /v1/* {
           reverse_proxy server:1250
       }
       handle /health {
           reverse_proxy server:1250
       }
       handle {
           reverse_proxy web:3000
       }
   }
   ```
4. Update `www/.env`:
   ```env
   SITE_URL=https://reflector.example.com
   NEXTAUTH_URL=https://reflector.example.com
   API_URL=https://reflector.example.com
   ```
5. Restart Caddy: `docker compose -f docker-compose.selfhosted.yml restart caddy web`

## Worker Polling Frequency

The selfhosted setup defaults all background worker polling intervals to **300 seconds (5 minutes)** to reduce CPU and memory usage. This controls how often the beat scheduler triggers tasks like recording discovery, meeting reconciliation, and calendar sync.

To change the interval, edit `server/.env`:

```env
# Poll every 60 seconds (more responsive, uses more resources)
CELERY_BEAT_POLL_INTERVAL=60

# Poll every 5 minutes (default for selfhosted)
CELERY_BEAT_POLL_INTERVAL=300

# Use individual per-task defaults (production SaaS behavior)
CELERY_BEAT_POLL_INTERVAL=0
```

After changing, restart the beat and worker containers:

```bash
docker compose -f docker-compose.selfhosted.yml restart beat worker
```

**Affected tasks when `CELERY_BEAT_POLL_INTERVAL` is set:**

| Task | Default (no override) | With override |
|------|-----------------------|---------------|
| SQS message polling | 60s | Override value |
| Daily.co recording discovery | 15s (no webhook) / 180s (webhook) | Override value |
| Meeting reconciliation | 30s | Override value |
| ICS calendar sync | 60s | Override value |
| Upcoming meeting creation | 30s | Override value |

> **Note:** Daily crontab tasks (failed recording reprocessing at 05:00 UTC, public data cleanup at 03:00 UTC) and healthcheck pings (10 min) are **not** affected by this setting.

## Troubleshooting

### Check service status
```bash
docker compose -f docker-compose.selfhosted.yml ps
```

### View logs for a specific service
```bash
docker compose -f docker-compose.selfhosted.yml logs server --tail 50
docker compose -f docker-compose.selfhosted.yml logs gpu --tail 50
docker compose -f docker-compose.selfhosted.yml logs web --tail 50
```

### GPU service taking too long
First start downloads ~1-2GB of ML models. Check progress:
```bash
docker compose -f docker-compose.selfhosted.yml logs gpu -f
```

### Server exits immediately
Usually a database migration issue. Check:
```bash
docker compose -f docker-compose.selfhosted.yml logs server --tail 50
```

### Caddy certificate issues
For self-signed certs, your browser will warn. Click Advanced > Proceed.
For Let's Encrypt, ensure ports 80/443 are open and DNS is pointed correctly.

### File processing timeout on CPU
CPU transcription and diarization are significantly slower than GPU. A 20-minute audio file can take 20-40 minutes to process on CPU. The setup script automatically sets `TRANSCRIPT_FILE_TIMEOUT=3600` and `DIARIZATION_FILE_TIMEOUT=3600` (1 hour) for `--cpu` mode. If you still hit timeouts with very long files, increase these values in `server/.env`:
```bash
# Increase to 2 hours for files over 1 hour
TRANSCRIPT_FILE_TIMEOUT=7200
DIARIZATION_FILE_TIMEOUT=7200
```
Then restart the worker: `docker compose -f docker-compose.selfhosted.yml restart worker`

### Summaries/topics not generating
Check LLM configuration:
```bash
grep LLM_ server/.env
```
If you didn't use `--ollama-gpu` or `--ollama-cpu`, you must set `LLM_URL`, `LLM_API_KEY`, and `LLM_MODEL`.

### Health check from inside containers
```bash
docker compose -f docker-compose.selfhosted.yml exec server curl http://localhost:1250/health
docker compose -f docker-compose.selfhosted.yml exec gpu curl http://localhost:8000/docs
```

## Updating

```bash
# Option A: Pull latest prebuilt images and restart (replays saved config automatically)
docker compose -f docker-compose.selfhosted.yml down
./scripts/setup-selfhosted.sh

# Option B: Build from source (after git pull) and restart
git pull
docker compose -f docker-compose.selfhosted.yml down
./scripts/setup-selfhosted.sh <same-flags-as-before> --build

# Rebuild only the GPU/CPU model image (picks up model updates)
docker compose -f docker-compose.selfhosted.yml build gpu  # or cpu
```

> **Note on config memory:** Running with no flags replays the saved config from your last run. Running with *any* flags replaces the saved config entirely — the script always saves the complete set of flags you provide. See [Config Memory](#config-memory-no-flag-re-run).

The setup script is idempotent — it won't overwrite existing secrets or env vars that are already set.

## Architecture Overview

```
                    ┌─────────┐
  Internet ────────>│  Caddy  │ :80/:443
                    └────┬────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
            v            v            │
       ┌─────────┐  ┌─────────┐      │
       │   web   │  │ server  │      │
       │ :3000   │  │ :1250   │      │
       └─────────┘  └────┬────┘      │
                         │            │
                    ┌────┴────┐       │
                    │ worker  │       │
                    │  beat   │       │
                    └────┬────┘       │
                         │            │
          ┌──────────────┼────────────┤
          │              │            │
          v              v            v
    ┌───────────┐  ┌─────────┐  ┌─────────┐
    │ ML models │  │postgres │  │  redis  │
    │ (varies)  │  │ :5432   │  │ :6379   │
    └───────────┘  └─────────┘  └─────────┘
          │
    ┌─────┴─────┐     ┌─────────┐
    │  ollama   │     │ garage  │
    │ (optional)│     │(optional│
    │ :11435    │     │ S3)     │
    └───────────┘     └─────────┘

    ┌───────────────────────────────────┐
    │  Hatchet (optional — Daily.co)   │
    │  ┌─────────┐  ┌───────────────┐  │
    │  │ hatchet │  │ hatchet-worker│  │
    │  │ :8888   │──│  -cpu / -llm  │  │
    │  └─────────┘  └───────────────┘  │
    └───────────────────────────────────┘

ML models box varies by mode:
  --gpu:    Local GPU container (transcription:8000)
  --cpu:    In-process on server/worker (no container)
  --hosted: Remote GPU service (user URL)
```

All services communicate over Docker's internal network. Only Caddy (if enabled) exposes ports to the internet. Hatchet services are only started when `DAILY_API_KEY` is configured.

