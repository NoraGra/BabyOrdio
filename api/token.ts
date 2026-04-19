import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AccessToken } from 'livekit-server-sdk'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers — needed for local dev
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { room, role } = req.query

  // --- Validate inputs ---
  if (!room || typeof room !== 'string' || !/^[a-z0-9]{8}$/.test(room)) {
    return res.status(400).json({ error: 'room must be an 8-character alphanumeric code' })
  }
  if (role !== 'baby' && role !== 'parent') {
    return res.status(400).json({ error: 'role must be "baby" or "parent"' })
  }

  // --- Check env vars ---
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    console.error('Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET')
    return res.status(500).json({ error: 'Server not configured' })
  }

  // --- Build token ---
  const identity = `${role}-${Date.now()}`

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: '8h',
  })

  at.addGrant({
    roomJoin: true,
    room,
    // Baby publishes camera + mic; parent publishes mic only (talk-to-baby)
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  })

  const token = await at.toJwt()

  return res.status(200).json({ token, identity })
}
