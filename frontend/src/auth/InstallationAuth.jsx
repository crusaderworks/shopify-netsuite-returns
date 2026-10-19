import { useEffect, useState } from 'react'
import { useAppBridge } from '@shopify/app-bridge-react'
import { getSessionToken } from '@shopify/app-bridge-utils'

import { API_BASE_URL } from '../config/env'
import AppContent from '../app/AppContent'

export default function InstallationAuth() {
  const app = useAppBridge()

  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('Connecting your store...')

  useEffect(() => {
    let cancelled = false

    async function install() {
      try {
        const token = await getSessionToken(app)

        const response = await fetch(
          `${API_BASE_URL}/api/installation`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          }
        )

        const result = await response.json().catch(() => ({}))

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || 'Store authentication failed.'
          )
        }

        if (!cancelled) {
          setStatus('success')
          setMessage('Store connected successfully.')
        }
      } catch (error) {
        if (!cancelled) {
          setStatus('error')
          setMessage(
            error.message || 'Unable to connect your store.'
          )
        }
      }
    }

    install()

    return () => {
      cancelled = true
    }
  }, [app])

  if (status === 'loading') {
    return <div style={{ padding: 24 }}>{message}</div>
  }

  if (status === 'error') {
    return (
      <div style={{ padding: 24 }}>
        <h2>Store connection failed</h2>
        <p>{message}</p>

        <button onClick={() => window.location.reload()}>
          Retry connection
        </button>
      </div>
    )
  }

  return <AppContent />
}