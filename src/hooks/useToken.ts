import { useState, useEffect } from 'react'

type TokenState =
  | { status: 'loading' }
  | { status: 'ready'; token: string }
  | { status: 'error'; message: string }

export function useToken(room: string, role: 'baby' | 'parent'): TokenState {
  const [state, setState] = useState<TokenState>({ status: 'loading' })

  useEffect(() => {
    setState({ status: 'loading' })

    fetch(`/api/token?room=${room}&role=${role}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((data: { token: string }) => {
        setState({ status: 'ready', token: data.token })
      })
      .catch((err: Error) => {
        setState({ status: 'error', message: err.message })
      })
  }, [room, role])

  return state
}
