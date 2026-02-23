<div align="center">
<img width="100" alt="image" src="https://github.com/user-attachments/assets/66fb367b-2c89-4516-9912-f47ac59c6a7f"/>

# Reflector

Reflector is an AI-powered audio transcription and meeting analysis platform that provides real-time transcription, speaker diarization, translation and summarization for audio content and live meetings. It works 100% with local models (whisper/parakeet, pyannote, seamless-m4t, and your local llm like phi-4).

[![Tests](https://github.com/monadical-sas/reflector/actions/workflows/test_server.yml/badge.svg?branch=main&event=push)](https://github.com/monadical-sas/reflector/actions/workflows/test_server.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
</div>
</div>
<table>
  <tr>
    <td>
      <a href="https://github.com/user-attachments/assets/21f5597c-2930-4899-a154-f7bd61a59e97">
        <img width="700" alt="image" src="https://github.com/user-attachments/assets/21f5597c-2930-4899-a154-f7bd61a59e97" />
      </a>
    </td>
    <td>
      <a href="https://github.com/user-attachments/assets/f6b9399a-5e51-4bae-b807-59128d0a940c">
        <img width="700" alt="image" src="https://github.com/user-attachments/assets/f6b9399a-5e51-4bae-b807-59128d0a940c" />
      </a>
    </td>
    <td>
      <a href="https://github.com/user-attachments/assets/a42ce460-c1fd-4489-a995-270516193897">
        <img width="700" alt="image" src="https://github.com/user-attachments/assets/a42ce460-c1fd-4489-a995-270516193897" />
      </a>
    </td>
    <td>
      <a href="https://github.com/user-attachments/assets/21929f6d-c309-42fe-9c11-f1299e50fbd4">
        <img width="700" alt="image" src="https://github.com/user-attachments/assets/21929f6d-c309-42fe-9c11-f1299e50fbd4" />
      </a>
    </td>
  </tr>
</table>

<p align="center" style="font-size: 1.5em; font-weight: bold;">By <a href="https://greyhaven.co">Greyhaven</a></p>

## What is Reflector?

Reflector is a web application that utilizes local models to process audio content, providing:

- **Real-time Transcription**: Convert speech to text using [Whisper](https://github.com/openai/whisper) (multi-language) or [Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) (English) models
- **Speaker Diarization**: Identify and label different speakers using [Pyannote](https://github.com/pyannote/pyannote-audio) 3.1
- **Live Translation**: Translate audio content in real-time to many languages with [Facebook Seamless-M4T](https://github.com/facebookresearch/seamless_communication)
- **Topic Detection & Summarization**: Extract key topics and generate concise summaries using LLMs
- **Meeting Recording**: Create permanent records of meetings with searchable transcripts

## Architecture

The project consists of three primary components:

- **Back-End**: Python FastAPI server with async database operations and background processing, found in `server/`.
- **Front-End**: Next.js 14 React application with Chakra UI, located in `www/`.
- **GPU Models**: Specialized ML models for transcription, diarization, translation, and summarization.

Currently, Reflector supports two input methods:
- **Screenshare capture**: Real-time audio capture from your browser via WebRTC
- **Audio file upload**: Upload pre-recorded audio files for processing

## Installation

For full deployment instructions, see the [Self-Hosted Production Guide](docsv2/selfhosted-production.md) and the [Architecture Reference](docsv2/selfhosted-architecture.md).

### Self-Hosted Deployment

The self-hosted setup script configures and launches everything on a single server:

```bash
# GPU with local Ollama LLM, local S3 storage, and Caddy reverse proxy
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy

# With a custom domain (enables Let's Encrypt auto-HTTPS)
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy --domain reflector.example.com

# CPU-only mode (slower, no NVIDIA GPU required)
./scripts/setup-selfhosted.sh --cpu --ollama-cpu --garage --caddy

# With password authentication
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy --password mysecretpass
```

The script is idempotent and safe to re-run. See `./scripts/setup-selfhosted.sh --help` for all options.

### Authentication

Reflector supports three authentication modes:

- **Password authentication (recommended for self-hosted / single-user)**: Use the `--password` flag in the setup script. This creates an `admin@localhost` user with the provided password. Users must log in to create, edit, or delete transcripts.

  ```bash
  ./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy --password mysecretpass
  ```

- **Authentik OIDC**: For multi-user or enterprise deployments, Reflector supports [Authentik](https://goauthentik.io/) as an OAuth/OIDC provider. This enables SSO, LDAP/AD integration, and centralized user management. Requires configuring `AUTH_BACKEND=jwt` on the backend and `AUTH_PROVIDER=authentik` on the frontend. See the [Self-Hosted Production Guide](docsv2/selfhosted-production.md) for details.

- **Public mode (default when no auth is configured)**: If neither password nor Authentik is set up, Reflector runs in public mode. In this mode, no login is required — anyone with access to the URL can use the application. Transcripts are created anonymously (not tied to any user account), which means they **cannot be edited or deleted** through the UI or API. Anonymous transcripts are automatically cleaned up after 7 days. This mode is suitable for demos or testing but not recommended for production use.

### Development Setup

```bash
# Backend
cd server
uv sync
docker compose up -d redis
uv run alembic upgrade head
uv run -m reflector.app --reload

# In a separate terminal — start the worker
cd server
uv run celery -A reflector.worker.app worker --loglevel=info

# Frontend
cd www
pnpm install
cp .env_template .env
pnpm dev
```

### Modal.com GPU (Optional)

Reflector also supports deploying specialized models (transcription, diarization) to [Modal.com](https://modal.com/) for serverless GPU processing. This is **not integrated into the self-hosted setup script** and must be configured manually.

See [Modal.com Setup Guide](docs/docs/installation/modal-setup.md) for deployment instructions.

## Audio Processing Commands

### Process a local audio file

```bash
cd server
uv run python -m reflector.tools.process path/to/audio.wav
```

### Reprocess an existing transcription

Re-run the processing pipeline on a previously uploaded transcription by its UUID:

```bash
cd server
uv run -m reflector.tools.process_transcript <transcript-uuid> --sync
```

## Usage

To record both your voice and the meeting you're taking part in, you need:

- For an in-person meeting, make sure your microphone is in range of all participants.
- If using several microphones, make sure to merge the audio feeds into one with an external tool.
- For an online meeting, if you do not use headphones, your microphone should be able to pick up both your voice and the audio feed of the meeting.
- If you want to use headphones, you need to merge the audio feeds with an external tool.

Permissions:

You may have to add permission for browser's microphone access to record audio in
`System Preferences -> Privacy & Security -> Microphone`
`System Preferences -> Privacy & Security -> Accessibility`. You will be prompted to provide these when you try to connect.

### How to Install Blackhole (Mac Only)

This is an external tool for merging the audio feeds as explained in the previous section of this document.
Note: We currently do not have instructions for Windows users.

- Install [Blackhole](https://github.com/ExistentialAudio/BlackHole)-2ch (2 ch is enough) by 1 of 2 options listed.
- Setup ["Aggregate device"](https://github.com/ExistentialAudio/BlackHole/wiki/Aggregate-Device) to route web audio and local microphone input.
- Setup [Multi-Output device](https://github.com/ExistentialAudio/BlackHole/wiki/Multi-Output-Device)
- Then goto `System Preferences -> Sound` and choose the devices created from the Output and Input tabs.
- The input from your local microphone, the browser run meeting should be aggregated into one virtual stream to listen to and the output should be fed back to your specified output devices if everything is configured properly.

## Build-time env variables

Next.js projects are more used to NEXT_PUBLIC_ prefixed buildtime vars. We don't have those for the reason we need to serve a customizable prebuilt docker container.

Instead, all the variables are runtime. Variables needed to the frontend are served to the frontend app at initial render.

It also means there's no static prebuild and no static files to serve for js/html.

## Feature Flags

Reflector uses environment variable-based feature flags to control application functionality. These flags allow you to enable or disable features without code changes.

### Available Feature Flags

| Feature Flag | Environment Variable |
|-------------|---------------------|
| `requireLogin` | `FEATURE_REQUIRE_LOGIN` |
| `privacy` | `FEATURE_PRIVACY` |
| `browse` | `FEATURE_BROWSE` |
| `sendToZulip` | `FEATURE_SEND_TO_ZULIP` |
| `rooms` | `FEATURE_ROOMS` |

### Setting Feature Flags

Feature flags are controlled via environment variables using the pattern `FEATURE_{FEATURE_NAME}` where `{FEATURE_NAME}` is the SCREAMING_SNAKE_CASE version of the feature name.

**Examples:**
```bash
# Enable user authentication requirement
FEATURE_REQUIRE_LOGIN=true

# Disable browse functionality
FEATURE_BROWSE=false

# Enable Zulip integration
FEATURE_SEND_TO_ZULIP=true
```

## Contribution Guidelines

All new contributions should be made in a separate branch, and goes through a Pull Request.
[Conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) must be used for the PR title and commits.

## Future Plans

- **Multi-language support enhancement**: Default language selection per room/user, automatic language detection improvements, multi-language diarization, and RTL language UI support
- **Jitsi integration**: Self-hosted video conferencing rooms with no external API keys, full control over video infrastructure, and enhanced privacy
- **Calendar integration**: Google Calendar and Microsoft Outlook synchronization, automatic meeting room creation, and post-meeting transcript delivery
- **Enhanced analytics**: Meeting insights dashboard, speaker participation metrics, topic trends over time, and team collaboration patterns
- **Advanced AI features**: Real-time sentiment analysis, emotion detection, meeting quality scores, and automated coaching suggestions
- **Integration ecosystem**: Slack/Teams notifications, CRM integration (Salesforce, HubSpot), project management tools (Jira, Asana), and knowledge bases (Notion, Confluence)
- **Performance improvements**: WebAssembly for client-side processing, edge computing support, and network optimization

## Legacy Documentation

The `docs/` folder contains an older Docusaurus-based documentation site. These docs are **no longer actively maintained** and may be outdated. For current installation and deployment instructions, refer to the [`docsv2/`](docsv2/) folder instead.
