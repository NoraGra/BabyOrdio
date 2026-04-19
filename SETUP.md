# Baby Ordio — Setup & Run Guide

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Vercel account | free tier works |

---

## 1. Clone & Install

```bash
git clone <your-repo-url>
cd baby-monitor
npm install
```

---

## 2. Environment Variables

Create a `.env.local` file in the project root:

```env
# ── LiveKit ────────────────────────────────────────────────────────────
# Your LiveKit Cloud project URL (wss://...)
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud

# LiveKit API key and secret (from LiveKit Cloud dashboard)
LIVEKIT_API_KEY=APInnnnnnnnn
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Vercel KV (Signaling) ──────────────────────────────────────────────
# Created automatically when you add a KV store in Vercel dashboard.
# For local dev: copy from Vercel project settings → Storage → your KV store
KV_REST_API_URL=https://your-kv.kv.vercel-storage.com
KV_REST_API_TOKEN=AXXXxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Optional: TURN server (improves P2P behind CGNAT / corporate firewalls) ──
# VITE_TURN_URL=turn:your-turn-server.com:3478
# VITE_TURN_USERNAME=username
# VITE_TURN_CREDENTIAL=credential

# ── Optional: Claude AI for session analysis ──────────────────────────
# ANTHROPIC_API_KEY=sk-ant-xxxx
```

### Where to get these values

**LiveKit:**
1. Sign up at [livekit.io](https://livekit.io) → Create a project
2. Copy the WebSocket URL (`wss://...`) → `VITE_LIVEKIT_URL`
3. Settings → API Keys → create a key pair → `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET`

**Vercel KV:**
1. `npm i -g vercel && vercel login`
2. `vercel link` (links project)
3. Vercel dashboard → Storage → Create KV → Link to project
4. Copy the environment variables from the KV dashboard

---

## 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

> **Note:** The API routes (`/api/signal`, `/api/token`) require Vercel KV.  
> For local development with KV access, use the Vercel CLI:
> ```bash
> npm i -g vercel
> vercel dev          # runs on http://localhost:3000
> ```

---

## 4. Deploy to Vercel

```bash
vercel deploy --prod
```

Or connect your GitHub repo in the Vercel dashboard for automatic deploys on push.

---

## 5. Using the App

### Step 1 — Baby Device

1. Open the app on the device you want to place near the baby
2. Tap **"Baby-Gerät"**
3. Allow camera and microphone when prompted
4. An **8-character code** appears (e.g. `ab3x 7k2m`)
5. Share this code with the parent device (tap "Code teilen")

### Step 2 — Parent Device

1. Open the app on your phone/laptop
2. Tap **"Eltern-Gerät"**
3. Enter the **8-character code** from the Baby-Gerät screen
4. Tap **"Monitoring starten"**

### Connection Modes

| Mode | Icon | Description |
|------|------|-------------|
| **Sicherer Modus** | 🔒 | LiveKit: encrypted via server, connects in <2 s, works everywhere |
| **Privater Modus** | 🔒 | P2P: direct device-to-device, no server sees the stream |

The app starts in **Sicherer Modus** and automatically upgrades to **Privater Modus** after ~10–20 seconds if both devices are on the same network. No action needed.

---

## 6. Connection States

| State | Meaning |
|-------|---------|
| 🟢 **Verfügbar** | Connected, stream flowing |
| 🟡 **Verbinde neu…** | Brief interruption, auto-recovering |
| 🟠 **Nur Audio** | Poor connection: video paused, audio continues |
| 🔴 **Unterbrochen** | Connection lost — check network |

---

## 7. Troubleshooting

**P2P doesn't switch to "Privater Modus"**  
→ Both devices must be on the same WiFi network. Corporate firewalls or CGNAT (mobile networks) may block P2P. Add a TURN server via `VITE_TURN_URL` to fix CGNAT.

**Parent can't hear the baby**  
→ Make sure you interacted with the parent page (clicked/tapped) before the stream started. Browsers block autoplay audio until user interaction.

**Camera flip shows black screen**  
→ Fixed in this version. If it persists, refresh the Baby-Gerät page.

**"Invalid code" error**  
→ The code is 8 alphanumeric characters (letters + digits). Spaces are ignored. Do NOT type numeric-only codes — the code contains letters.

---

## 8. Architecture Overview

```
Baby-Gerät                LiveKit Cloud            Eltern-Gerät
   │                           │                        │
   ├── getUserMedia()           │                        │
   ├── publishTrack(video+mic) ─┤──── Video + Audio ─────┤
   │                           │                        │
   ├── useP2PProbe ─────── Vercel KV (signal:codepr) ────┤
   │   (ICE data-channel test only)                      │
   │                           │                        │
   ├── useWebRTC ──────── Vercel KV (signal:code) ────────┤
   │   offer/answer/ICE        │                        │
   │                           │                        │
   └── P2P connected ──────────┼────── Direct stream ───┘
         (if same network)     │      (no server)
                               │
                    Vercel Functions
                    /api/token    (LiveKit JWT)
                    /api/signal   (WebRTC signaling via KV)
                    /api/analyze  (Claude AI session analysis)
```
