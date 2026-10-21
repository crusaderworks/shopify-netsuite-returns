import { AppProvider } from '@shopify/polaris'
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react'

import AppNavigation from './app/AppNavigation'
import AppContent from './app/AppContent'
import ReturnRequest from './storefront/pages/ReturnRequest'
import ReturnStatus from './storefront/pages/ReturnStatus'
import { API_KEY } from './config/env'
import { ROUTES } from './app/routes'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const host = params.get('host')

  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  // 1. Direct Return Request Page (Storefront)
  if (path === ROUTES.returnRequest) {
    return (
      <AppProvider i18n={{}}>
        <ReturnRequest />
      </AppProvider>
    )
  }

  // 2. Direct Return Status Page (Storefront)
  if (path === ROUTES.returnStatus) {
    return (
      <AppProvider i18n={{}}>
        <ReturnStatus />
      </AppProvider>
    )
  }

  // 3. Admin Fallback (Outside Shopify / Missing config)
if (!host || !API_KEY) {
  return (
    <AppProvider i18n={{}}>
      <main
        style={{
          padding: 24,
          textAlign: 'center',
          fontFamily: '-apple-system, sans-serif',
        }}
      >
        <h2>Shopify App Configuration</h2>

        <p>
          API Key Status:{' '}
          <strong>{API_KEY ? 'Loaded' : 'Missing'}</strong>
        </p>

        <p>
          Host Parameter:{' '}
          <strong>{host ? 'Received' : 'Missing'}</strong>
        </p>

        <p>
          { !API_KEY
            ? 'Set VITE_SHOPIFY_API_KEY in your frontend .env file.'
            : 'Open this application from Shopify Admin to receive the host parameter.'
          }
        </p>
      </main>
    </AppProvider>
  )
}

  // 4. Embedded Shopify Admin App (Fully secured via App Bridge Provider)
  return (
    <AppBridgeProvider
      config={{
        apiKey: API_KEY,
        host,
        forceRedirect: true,
      }}
    >
      <AppProvider i18n={{}}>
        <AppNavigation />
        <AppContent />
      </AppProvider>
    </AppBridgeProvider>
  )
}