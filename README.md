# Baby Monitor

A real-time baby monitor web app — audio and video over WebRTC via LiveKit.

## How it works

Open the app on two devices. One becomes the **Baby Device** (streams audio + video), the other becomes the **Parent Device** (monitors). They pair via a 6-digit code. The stream works on the same Wi-Fi network and across different networks without any configuration.

---

## Setup

### 1. Create a LiveKit Cloud account

Go to [cloud.livekit.io](https://cloud.livekit.io) and create a free account. Create a new project. Copy your **API Key**, **API Secret**, and **WebSocket URL** (looks like `wss://your-project.livekit.cloud`).

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/baby-monitor.git
cd baby-monitor
npm install
```

### 3. Set environment variables

Copy the example file and fill in your LiveKit credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxx
LIVEKIT_API_SECRET=your-secret-here
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud

# Optional — enables Claude AI session analysis
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
```

`ANTHROPIC_API_KEY` is optional. Without it the app works fully — session analysis falls back to a template-based summary. To enable live Claude AI analysis, get a key at [console.anthropic.com](https://console.anthropic.com).

### 4. Run locally

```bash
npm run dev
```

This uses `vercel dev` which runs both the frontend and the `/api/token` serverless function together on `http://localhost:3000`.

> **Note:** Camera and microphone require a secure context. `vercel dev` serves over HTTP on localhost which browsers treat as secure. For testing on a phone on the same Wi-Fi, you'll need HTTPS — see the deployment step below.

---

## Deploy to Vercel (for cross-device testing)

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com), create a free account, and import the repo.
3. In the Vercel project settings → **Environment Variables**, add:
   - `LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `VITE_LIVEKIT_URL`
   - `ANTHROPIC_API_KEY` *(optional — for Claude AI session analysis)*
4. Deploy. Vercel gives you an HTTPS URL like `https://baby-monitor-xyz.vercel.app`.
5. Open that URL on two devices — done.

---

## Using the app

**On the baby's device:**
1. Open the app URL in the browser.
2. Tap **Baby Device**.
3. Allow camera and microphone permissions when prompted.
4. A 6-digit pairing code appears on screen.

**On the parent's device:**
1. Open the same app URL.
2. Tap **Parent Device**.
3. Enter the 6-digit code shown on the baby device.
4. Tap **Start Monitoring** — the live stream begins.

---

## Connection states

| State | Meaning |
|---|---|
| **Connected** | Audio and video flowing normally |
| **Reconnecting** | Temporary drop — auto-recovering |
| **Audio Only** | Video paused to maintain connection (audio continues) |
| **Connection Lost** | Session interrupted — tap Reconnect |

Audio is always prioritised. If the connection degrades, the baby device automatically pauses video while keeping audio live.

---

## Conscious simplifications

- **No auth** — the 6-digit code is the only access control. Fine for private home use.
- **Background streaming** — uses the Screen Wake Lock API to keep the screen on. On iOS Safari, if the user switches apps, the stream may pause. This is a known WebKit limitation; a native wrapper (Capacitor) would solve it in v2.
- **No cloud recording** — streams are peer-to-peer (or TURN-relayed when cross-network). No media is stored on any server.
- **Single parent view** — one parent can monitor at a time.

---

## Tech stack

- **React + Vite** — frontend
- **LiveKit** — WebRTC infrastructure (rooms, TURN, reconnection)
- **Vercel** — hosting + serverless token generation
- **Claude (Anthropic)** — AI session analysis via `/api/analyze`
