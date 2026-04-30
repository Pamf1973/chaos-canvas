# 🎨 Chaos Canvas

> A collaborative drawing experience where **5 people must communicate to draw anything** — because each person only controls ONE aspect of the brush.

## The Roles

| Role | Controls | Color |
|------|----------|-------|
| ↔️ Player A | X-Axis (Left/Right) | 🔴 Red |
| ↕️ Player B | Y-Axis (Up/Down) | 🟦 Teal |
| 🎨 Player C | Color (Hue 0–360°) | 🟡 Yellow |
| ⭕ Player D | Brush Size (2–60px) | 🟢 Mint |
| ✏️ Player E | Pen Down / Lift | 🟣 Lavender |

## Running Locally

```bash
npm install
npm run dev   # or: node server.js
```

Open [http://localhost:3000](http://localhost:3000)

All team members share the **same room code** to draw together.

## Deploy to Railway

1. Push to GitHub
2. Create a new project in [Railway](https://railway.app)
3. Connect your GitHub repo
4. Railway auto-detects Node.js (or uses the Dockerfile)
5. Set no env vars needed — it just works!
6. Share the Railway URL with your team 🚀

## How to Play

1. All 5 players join with the **same room code**
2. A challenge appears at the top (e.g. "Draw a Car 🚗")
3. Each player drags their slider / presses their button
4. **Communicate loudly!** — "Move X to 400!", "PEN DOWN NOW!", "Make it bigger!"
5. Try to draw the challenge object together

## Tech Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla HTML/CSS/JS + Canvas API
- **Deploy**: Railway (Dockerfile included)
