# Migrating from Daily.co to LiveKit

This guide covers running LiveKit alongside Daily.co or fully replacing it.

## Both Platforms Run Simultaneously

LiveKit and Daily.co coexist — the platform is selected **per room**. You don't need to migrate all rooms at once.

- Existing Daily rooms continue to work as-is
- New rooms can use LiveKit
- Each room's `platform` field determines which video service is used
- Transcripts, topics, summaries work identically regardless of platform

## Step 1: Enable LiveKit

Add `--livekit` to your setup command:

```bash
# If currently running:
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --garage --caddy

# Add --livekit:
./scripts/setup-selfhosted.sh --gpu --ollama-gpu --livekit --garage --caddy
```

This starts `livekit-server` + `livekit-egress` containers alongside your existing stack.

## Step 2: Set Default Platform

The setup script automatically sets `DEFAULT_VIDEO_PLATFORM=livekit` in `server/.env`. This means **new rooms** default to LiveKit. Existing rooms keep their current platform.

To keep Daily as the default for new rooms:
```bash
# In server/.env, change:
DEFAULT_VIDEO_PLATFORM=daily
```

## Step 3: Switch Individual Rooms

In the Rooms admin page, edit any room and change the **Platform** dropdown from "Daily" to "LiveKit". The next meeting in that room will use LiveKit.

Previously recorded Daily transcripts for that room are unaffected.

## Step 4: (Optional) Remove Daily.co

Once all rooms use LiveKit and you no longer need Daily.co:

1. Remove `DAILY_API_KEY` and related Daily settings from `server/.env`
2. Re-run the setup script — it won't activate the `dailyco` profile
3. Hatchet workers are shared between Daily and LiveKit, so they continue running

Daily-specific services that stop:
- `hatchet-worker-cpu` with `dailyco` profile (but continues if `livekit` profile is active)
- Daily webhook polling tasks (`poll_daily_recordings`, etc.)

## What Changes for Users

| Feature | Daily.co | LiveKit |
|---------|---------|---------|
| Video/audio quality | Daily.co SFU | LiveKit SFU (comparable) |
| Pre-join screen | Daily's built-in iframe | LiveKit PreJoin component (name + device selection) |
| Recording | Starts via REST API from frontend | Auto Track Egress (automatic, no user action) |
| Multitrack audio | Per-participant WebM tracks | Per-participant OGG tracks |
| Transcript quality | Same pipeline | Same pipeline |
| Self-hosted | No (SaaS only) | Yes (fully self-hosted) |

## Database Changes

None required. The `platform` field on rooms and meetings already supports `"livekit"`. LiveKit recordings use recording IDs prefixed with `lk-` to distinguish them from Daily recordings.

## Rollback

To revert a room back to Daily, just change the Platform dropdown back to "Daily" in the Rooms admin page. No data migration needed.
