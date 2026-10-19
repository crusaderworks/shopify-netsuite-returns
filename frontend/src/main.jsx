import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@shopify/polaris/build/esm/styles.css'

import App from './App.jsx'
import { ToastProvider } from './components/ui/ToastProvider'
import './styles/ui.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element "#root" was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
)
