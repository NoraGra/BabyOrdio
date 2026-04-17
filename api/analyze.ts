import type { VercelRequest, VercelResponse } from '@vercel/node'

interface SessionStats {
  durationSec: number
  cryCount: number
  cryTotalSec: number
  moveCount: number
  peakCryLevel: number
  sessionCode: string
  isLive?: boolean
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stats: SessionStats = req.body

  // Fallback template analysis if no API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ analysis: generateFallbackAnalysis(stats) })
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const durationMin = Math.floor(stats.durationSec / 60)
    const durationSec = stats.durationSec % 60
    const cryMin = Math.floor(stats.cryTotalSec / 60)
    const crySec = stats.cryTotalSec % 60

    const isLive = !!stats.isLive
    const context = isLive
      ? `Du analysierst eine laufende Baby-Monitor-Session. Die Daten zeigen den bisherigen Verlauf.`
      : `Du analysierst eine abgeschlossene Baby-Monitor-Session.`

    const prompt = `Du bist ein einfühlsamer Baby-Monitor-Assistent. ${context}

Session-Daten (bisher):
- Dauer: ${durationMin > 0 ? `${durationMin} Min. ` : ''}${durationSec} Sek.
- Weinphasen: ${stats.cryCount} Mal (gesamt ${cryMin > 0 ? `${cryMin} Min. ` : ''}${crySec} Sek.)
- Stärkstes Weinen: ${stats.peakCryLevel}/10
- Bewegungsereignisse: ${stats.moveCount}

Schreibe 2–3 Sätze auf Deutsch. Sei warm, konkret und direkt — keine Floskeln. ${isLive ? 'Beziehe dich auf den bisherigen Verlauf der laufenden Session.' : 'Fasse die Session zusammen.'} Keine Aufzählungen, kein Markdown.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    return res.json({ analysis: text })

  } catch (err) {
    console.error('[analyze] Claude API error:', err)
    // Fall back to template on error
    return res.json({ analysis: generateFallbackAnalysis(stats) })
  }
}

function generateFallbackAnalysis(stats: SessionStats): string {
  const durationMin = Math.floor(stats.durationSec / 60)

  if (stats.cryCount === 0 && stats.moveCount < 3) {
    return `Das Baby hat während der ${durationMin}-minütigen Session sehr ruhig geschlafen — keine Weinphasen und kaum Bewegung. Alles war in Ordnung.`
  }

  if (stats.cryCount === 0) {
    return `Die ${durationMin}-minütige Session verlief ruhig: Kein Weinen festgestellt, jedoch ${stats.moveCount} Bewegungen registriert — das Baby hat sich etwas geregt, war aber insgesamt entspannt.`
  }

  const cryMin = Math.floor(stats.cryTotalSec / 60)
  const crySec = stats.cryTotalSec % 60
  const durStr = cryMin > 0 ? `${cryMin} Min. ${crySec} Sek.` : `${crySec} Sek.`

  return `In den ${durationMin} Minuten hat das Baby ${stats.cryCount} Mal geweint (gesamt ${durStr}). Die Bewegungsaktivität war mit ${stats.moveCount} Ereignissen ${stats.moveCount > 10 ? 'recht hoch' : 'moderat'}. Die stärkste Weinphase erreichte Intensität ${stats.peakCryLevel}/10.`
}
