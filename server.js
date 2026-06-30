# Members App

A small, invite-only member directory with profiles, social links, and a music player.

## Quick Start (Local)

```bash
npm install
npm start
# Open http://localhost:3000
```

## Deploy to Railway (Recommended - Free)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and sign in with GitHub
3. Click **New Project** → **Deploy from GitHub repo**
4. Select your repo
5. Railway auto-detects the `Dockerfile` and deploys
6. Copy the deployed URL (e.g., `https://members-app.up.railway.app`)
7. In `public/index.html`, change `const API_URL = '';` to `const API_URL = 'https://your-railway-url';`
8. Push the change → Railway redeploys automatically

## Deploy to Render (Free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Render reads `render.yaml` and auto-configures
5. Copy the deployed URL and update `API_URL` in `public/index.html`

## Deploy to Fly.io (Free tier)

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly launch
fly deploy
```

## File Structure

```
├── server.js          # Express + SQLite backend
├── package.json       # Dependencies
├── Dockerfile         # Container config
├── railway.toml       # Railway config
├── render.yaml        # Render config
├── fly.toml           # Fly.io config
├── .dockerignore      # Docker exclusions
├── public/
│   └── index.html     # Frontend (served by Express)
└── members.db         # SQLite database (created on first run)
```

## Features

- **Invite-only registration** — first user becomes admin automatically
- **Admin panel** — generate invite codes, manage members
- **Profiles** — avatar, bio, social links, songs
- **Music player** — upload or link audio files
- **CSV export** — download member list

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |

## Notes

- SQLite database (`members.db`) is created automatically on first run
- For production with Railway/Render, the database persists on the container's filesystem
- For horizontal scaling, switch to PostgreSQL (Railway provides this)
