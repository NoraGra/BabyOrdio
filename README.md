# Ordio Baby Monitor

A real-time baby monitor web app — live video and audio streamed directly between two devices. No accounts, no subscriptions, no recordings.

---

## How it works

Open the app on two devices. One becomes the **Baby Device** (streams camera + mic), the other becomes the **Parent Device** (monitors). They pair via an 8-character code.

The app connects in two modes automatically:

| Mode | What it is |
|------|-----------|
| **Sicherer Modus** | Encrypted via LiveKit server. Connects in under 2 seconds. Works on any network. |
| **Privater Modus** | Direct device-to-device P2P. No server ever sees the stream. Activates automatically after ~15 seconds on the same WiFi. |

---

## Setup

### 1. Services needed

- **[LiveKit Cloud](https://livekit.io)** (free tier) — WebRTC infrastructure
- **[Vercel](https://vercel.com)** (free tier) — hosting + serverless functions + KV store for signaling

### 2. Install

```bash
npm install
```

### 3. Environment variables

Create `.env.local` in the project root:

```env
# LiveKit
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APInnnnnnnnn
LIVEKIT_API_SECRET=your-secret-here

# Vercel KV (copy from Vercel dashboard → Storage → your KV store)
KV_REST_API_URL=https://your-kv.kv.vercel-storage.com
KV_REST_API_TOKEN=AXXXxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional — Claude AI for session analysis
# ANTHROPIC_API_KEY=sk-ant-xxxx
```

**Getting LiveKit credentials:** Sign up → create a project → copy the WebSocket URL and create an API key pair.

**Getting Vercel KV credentials:** `vercel link` → Vercel dashboard → Storage → Create KV store → link to project → copy the env vars.

### 4. Run locally

```bash
vercel dev    # http://localhost:3000
```

> Use `vercel dev` (not `npm run dev`) — it runs the `/api` serverless functions alongside the frontend.

### 5. Deploy

```bash
vercel deploy --prod
```

Or connect your GitHub repo in the Vercel dashboard for automatic deploys. Make sure all environment variables are set in the Vercel project settings.

---

## Using the app

**Baby Device** (place near the baby):
1. Open the app → tap **Baby-Gerät**
2. Allow camera and microphone
3. An 8-character code appears — share it via the share button or QR code

**Parent Device:**
1. Open the same URL → tap **Eltern-Gerät**
2. Enter the 8-character code → **Monitoring starten**
3. On iOS: tap **🔊 Audio aktivieren** if the button appears — iOS requires a tap before audio can play

---

## Troubleshooting

**P2P never switches to Privater Modus**  
Both devices must be on the same WiFi. Behind CGNAT or a corporate firewall, add a TURN server: set `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` in your env.

**No audio on iOS**  
Tap the **🔊 Audio aktivieren** button that appears after the connection switches to Privater Modus.

**"Invalid code" error**  
The code is 8 alphanumeric characters (letters + numbers). Spaces are ignored when typing.

**Screen goes black / stream stops on iOS**  
Keep the app in the foreground. iOS Safari pauses background tabs — this is a WebKit limitation.

---

## Tech stack

- **React + Vite** — frontend
- **LiveKit** — WebRTC rooms, TURN relay, reconnection handling
- **Vercel** — hosting + serverless token API (`/api/token`) + session analysis API (`/api/analyze`)
- **Vercel KV** — lightweight signaling store for P2P offer/answer/ICE exchange
- **Claude (Anthropic)** — optional AI analysis of monitoring sessions (`ANTHROPIC_API_KEY`)
