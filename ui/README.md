# Reflector UI (v2)

Vite + React 19 + TypeScript SPA, served at `/v2` behind Caddy. Lives alongside the existing Next.js app in `../www` while the migration is in progress.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind v4** with Greyhaven design tokens (`src/styles/greyhaven.css`)
- **React Router v7**, routes mounted under `/v2/*`
- **TanStack Query** + **openapi-fetch** with types generated from the backend OpenAPI spec
- **nuqs** for URL-backed page/search state on `/browse`
- **react-oidc-context** (OIDC Authorization Code + PKCE) for the JWT auth backend
- Password-form fallback for the `password` auth backend (`POST /v1/auth/login`)

## Local development

```bash
cd ui
pnpm install

# Point the dev server at your local backend (defaults to http://localhost:1250).
cp .env.example .env
# Edit VITE_OIDC_AUTHORITY / VITE_OIDC_CLIENT_ID if your backend runs in JWT mode.

pnpm dev          # http://localhost:3001/v2/
pnpm build        # production bundle in dist/
pnpm typecheck    # tsc --noEmit
pnpm openapi      # regenerate src/api/schema.d.ts from the running backend
```

`pnpm openapi` hits `http://127.0.0.1:1250/openapi.json` — start the backend first (`cd ../server && uv run -m reflector.app --reload`).

## Auth modes

The SPA auto-detects the backend's auth backend:

- **JWT (OIDC/SSO via Authentik):** set `VITE_OIDC_AUTHORITY` and `VITE_OIDC_CLIENT_ID`. The app does the Authorization Code + PKCE flow; Authentik hosts the login page. Register a **Public** OAuth client whose redirect URI is `https://<your-domain>/v2/auth/callback`. No client secret is baked into the bundle.
- **Password:** leave the OIDC env vars blank. The app shows an in-page email/password form that posts to `/v1/auth/login` and stores the returned JWT in `sessionStorage`.
- **None:** backend returns a fake user for every request; the SPA treats that as authenticated.

## Deployment (selfhosted)

`docker-compose.selfhosted.yml` defines a `ui` service that builds this directory and serves the static bundle from nginx on port 80. Caddy routes `/v2/*` to `ui:80` and leaves the root path on the existing `web` service.

Pass OIDC config as build args (Vite inlines `VITE_*` at build time):

```bash
VITE_OIDC_AUTHORITY=https://auth.example/application/o/reflector/ \
VITE_OIDC_CLIENT_ID=reflector-ui \
docker compose -f docker-compose.selfhosted.yml build ui
docker compose -f docker-compose.selfhosted.yml up -d ui
```

## Pages shipped in this pass

- `/` — Home / Create new transcript (single-form shipping variant)
- `/browse` — transcript list with FTS search, source/room/trash filters, pagination
- `/rooms` — rooms list, create, edit, delete
- `/welcome` — logged-out landing (OIDC mode)
- `/login` — password login form (password mode)
- `/auth/callback` — OIDC redirect target

Not yet ported:
- Transcript detail / playback
- Meeting / live join
- Settings, API keys
- Tags sidebar (backend model doesn't exist yet)
- Progress streaming over WebSocket

## Directory map

```
src/
  api/         fetch client, generated OpenAPI types
  auth/        AuthProvider, RequireAuth, OIDC config
  components/
    browse/    TranscriptRow, FilterBar, Pagination
    home/      LanguagePair, RoomPicker
    icons.tsx  lucide-react wrapper (compat with prototype I.* shape)
    layout/    AppShell, AppSidebar, TopBar
    rooms/     RoomsTable, RoomFormDialog, DeleteRoomDialog
    ui/        primitives (Button, StatusDot, StatusBadge, SidebarItem, …)
  hooks/       useRooms, useTranscripts
  lib/         utils, format helpers, types
  pages/       HomePage, BrowsePage, RoomsPage, LoggedOut, LoginForm, AuthCallback
  styles/      greyhaven.css, reflector-forms.css, index.css (Tailwind entry)
```
