# GOG Free Game Claimer 🎮

Automatically claims free GOG giveaway games

Just an authenticated HTTP GET to `https://www.gog.com/giveaway/claim`. That's it.

## How it works

GOG exposes a `/giveaway/claim` endpoint that, when hit with valid session cookies, instantly adds the current free game to your library. This is the same thing your browser does when you click "Get it Free" — just without the browser.

---

## Setup

### 1. Get your GOG cookies

You only need to do this once (or whenever your session expires — typically every few months).

1. Open your browser and **log in to GOG.com**
2. Open DevTools → **F12** (or right-click → Inspect)
3. Go to the **Network** tab
4. Refresh the page
5. Click any request to `gog.com`
6. In the **Request Headers**, find the `Cookie:` header
7. Copy the **entire value** — it will look something like:
   ```
   gog-al=eyJ....; gog_us=eyJ....; ...
   ```

### 2. Configure

```bash
cp .env.example .env
```

Paste your cookies into `.env`:

```env
GOG_COOKIE=gog-al=eyJ....; gog_us=eyJ....
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...   # optional
```

### 3. Run

**One-shot (claim right now):**
```bash
npm install
npm start
```

**Test your cookies without claiming:**
```bash
node claimer.js --dry-run
```

---

## Docker

### Pull from Docker Hub

```bash
docker pull corylewis/gog-free-games-claimer:latest
```

### Run with Docker

```bash
docker run --rm \
  --name gog-claimer \
  -e GOG_COOKIE="your_full_cookie_string_here" \
  -e DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
  -v $(pwd)/data:/app/data \
  corylewis/gog-free-games-claimer:latest
```

### Run with Docker Compose

1. Copy `.env.example` to `.env` and fill in your cookies
2. Update the image name in `docker-compose.yml`
3. Run:

```bash
docker compose up
```

View logs:
```bash
docker logs -f gog-claimer
```

### Build locally

```bash
docker build -t gog-free-games-claimer .
docker run -e GOG_COOKIE="..." gog-free-games-claimer
```

### Discord notifications (optional)

Set `DISCORD_WEBHOOK_URL` to receive run updates in a Discord channel. If omitted, webhook notifications are skipped.

You can create a webhook in Discord via **Server Settings → Integrations → Webhooks**.

---

## Publish to Docker Hub

### One-time setup

1. Create a repo on [hub.docker.com](https://hub.docker.com) named `gog-free-games-claimer`
2. Add these secrets to your GitHub repo (Settings → Secrets → Actions):
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — a Docker Hub access token ([create one here](https://hub.docker.com/settings/security))

### Auto-publish

The included GitHub Actions workflow (`.github/workflows/docker-publish.yml`) will automatically build and push to Docker Hub on every push to `main`, and tag releases when you push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This builds for both `linux/amd64` and `linux/arm64` (works on Raspberry Pi too).

---

## Claim history

Every claim is logged to `data/claims.json`:

```json
[
  {
    "timestamp": "2026-04-26 09:00:01",
    "outcome": "claimed",
    "title": "The Whispering Valley",
    "username": "YourGOGUsername"
  }
]
```

Mount `./data:/app/data` in Docker to persist this across runs.

---

## Cookie expiry

GOG sessions typically last a few months. If the claimer starts logging auth errors, just repeat the cookie grab steps above and update your `.env` (or the Docker environment variable).

---

## License

MIT
