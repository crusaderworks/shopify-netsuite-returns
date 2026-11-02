
import { lazy, Suspense } from 'react'

import { AppProvider } from '@shopify/polaris'
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react'

import AppNavigation from './app/AppNavigation'
import AppContent from './app/AppContent'

import { API_KEY } from './config/env'
import { ROUTES } from './app/routes'

// Lazy-loaded Storefront Pages
const ReturnRequest = lazy(() =>
  import('./storefront/pages/ReturnRequest')
)

const ReturnStatus = lazy(() =>
  import('./storefront/pages/ReturnStatus')
)

// Reusable Loading Screen
function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#555',
      }}
    >
      Loading...
    </div>
  )
}

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const host = params.get('host')

  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  // 1. Storefront: Return Request Page
  if (path === ROUTES.returnRequest) {
    return (
      <AppProvider i18n={{}}>
        <Suspense fallback={<LoadingScreen />}>
          <ReturnRequest />
        </Suspense>
      </AppProvider>
    )
  }

  // 2. Storefront: Return Status Page
  if (path === ROUTES.returnStatus) {
    return (
      <AppProvider i18n={{}}>
        <Suspense fallback={<LoadingScreen />}>
          <ReturnStatus />
        </Suspense>
      </AppProvider>
    )
  }

  // 3. Shopify Admin Configuration Fallback
  if (!host || !API_KEY) {
    return (
      <AppProvider i18n={{}}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          <div>
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
              {!API_KEY
                ? 'Set VITE_SHOPIFY_API_KEY in your frontend .env file.'
                : 'Open this application from Shopify Admin to receive the host parameter.'}
            </p>
          </div>
        </main>
      </AppProvider>
    )
  }

  // 4. Embedded Shopify Admin App
  return (
    <AppBridgeProvider
      config={{
        apiKey: API_KEY,
        host,
        forceRedirect: true,
      }}
    >
      <AppProvider i18n={{}}>
        <Suspense fallback={<LoadingScreen />}>
          <AppNavigation />
          <AppContent />
        </Suspense>
      </AppProvider>
    </AppBridgeProvider>
  )
}
