# Deployment Guide — Blokus Trigon

This is a monorepo with two deployable units:

| Unit | Directory | Platform |
|---|---|---|
| Frontend (React + Vite) | `client/` | **Vercel** |
| Backend (Node.js + Socket.io) | `server/` | **Railway** |

---

## Prerequisites

- Node.js 18+
- A GitHub account with this repo pushed
- Free accounts on [vercel.com](https://vercel.com) and [railway.app](https://railway.app)

---

## Local Development

Install all dependencies from the repo root:

```bash
npm install
```

Start both servers concurrently:

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

Or start separately:

```bash
npm run dev:client   # Vite dev server at :5173 (proxies /socket.io → :3001)
npm run dev:server   # Node server at :3001
```

---

## 1. Deploy Backend to Railway

### Setup

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your `blokus-trigon` repository
3. Railway will detect it as a Node.js project

### Configuration

In Railway's project settings:

**Root Directory:** `server`

**Start Command:** `node src/index.js`

**Environment Variables** (Settings → Variables):

| Key | Value |
|---|---|
| `PORT` | `3001` (Railway sets this automatically — you don't need to add it) |
| `CLIENT_ORIGIN` | Your Vercel URL (e.g. `https://blokus-trigon.vercel.app`) — add this after deploying the frontend |

### Get the Railway URL

After deploying, Railway gives you a public URL like:
`https://blokus-trigon-server.up.railway.app`

Save this — you'll need it for the Vercel environment variable.

---

## 2. Deploy Frontend to Vercel

### Setup

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo
2. Configure the project:

**Framework Preset:** Vite

**Root Directory:** `client`

**Build Command:** `npm run build`

**Output Directory:** `dist`

### Environment Variables

In Vercel's project settings → Environment Variables:

| Key | Value |
|---|---|
| `VITE_SERVER_URL` | Your Railway URL (e.g. `https://blokus-trigon-server.up.railway.app`) |

> **Important:** `VITE_` prefix is required for Vite to expose the variable to the browser bundle.

### Deploy

Click **Deploy**. Vercel auto-deploys on every push to `main`.

---

## 3. Final Steps

1. **Update Railway** `CLIENT_ORIGIN` with your Vercel URL (for CORS)
2. **Test** the full flow: open the Vercel URL on two different devices and create/join a room

---

## Environment Summary

### client/.env.local (local dev — do not commit)
```
VITE_SERVER_URL=
```
Leave empty in local dev. The Vite proxy config handles routing `/socket.io` to `localhost:3001`.

### server/.env (local dev — do not commit)
```
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

---

## Architecture

```
CLIENT (Vercel)
  └─ React + Vite
       ├─ LandingPage — create/join room, pass-and-play, how-to-play
       ├─ WaitingRoom — pre-game lobby
       ├─ GameScreen  — in-game UI (shared with pass-and-play)
       └─ socket.io-client → SERVER

SERVER (Railway)
  └─ Express + Socket.io
       ├─ roomManager.js  — in-memory room/session store
       ├─ gameEngine.js   — authoritative rule enforcement
       └─ game/           — shared game logic (copy of client/src/game/)
```

---

## Notes

- **Session persistence:** Game sessions are stored in server memory only. If the Railway server restarts, all active games are lost. This is by design for Phase 3.
- **Free tier cold starts:** Railway's free tier may sleep after inactivity. Socket.io connections will wait for the server to wake. Consider upgrading to a paid plan for production use.
- **Player reconnection:** Each browser stores a session token in `localStorage`. If a player refreshes or rejoins with the same token + room code, they are automatically reconnected to their slot.
