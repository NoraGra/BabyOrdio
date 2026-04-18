import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const TTL = 4 * 60 * 60 // 4 hours

interface SignalState {
  offer?:     { type: string; sdp: string }
  answer?:    { type: string; sdp: string }
  babyIce:    string[]   // JSON-stringified RTCIceCandidateInit[]
  parentIce:  string[]
  mode:       'p2p' | 'livekit'
  createdAt:  number
}

const fresh = (): SignalState => ({
  babyIce: [], parentIce: [], mode: 'p2p', createdAt: Date.now(),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const code = (req.method === 'GET' ? req.query.code : req.body?.code) as string
  if (!code || !/^[a-z0-9]{8}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code' })
  }

  const key = `signal:${code}`

  // ── GET: return full signal state ──────────────────────────────────────
  if (req.method === 'GET') {
    const state = (await kv.get<SignalState>(key)) ?? fresh()
    return res.status(200).json(state)
  }

  // ── POST: update specific field ────────────────────────────────────────
  if (req.method === 'POST') {
    const { type, data } = req.body as { type: string; data: unknown }
    const state = (await kv.get<SignalState>(key)) ?? fresh()
    let next: SignalState

    switch (type) {
      case 'offer':
        next = { ...state, offer: data as SignalState['offer'] }
        break
      case 'answer':
        next = { ...state, answer: data as SignalState['answer'] }
        break
      case 'baby-ice':
        next = { ...state, babyIce: [...state.babyIce, JSON.stringify(data)] }
        break
      case 'parent-ice':
        next = { ...state, parentIce: [...state.parentIce, JSON.stringify(data)] }
        break
      case 'mode':
        next = { ...state, mode: data as 'p2p' | 'livekit' }
        break
      case 'reset':
        next = fresh()
        break
      default:
        return res.status(400).json({ error: `Unknown type: ${type}` })
    }

    await kv.set(key, next, { ex: TTL })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
