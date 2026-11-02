import Dashboard from '../admin/pages/Dashboard'
import Returns from '../admin/pages/Returns'
import NetSuite from '../admin/pages/NetSuite'
import '@shopify/polaris/build/esm/styles.css'
import Logs from '../admin/pages/Logs'
import ReturnPortalConfigAdmin from '../admin/pages/ReturnPortalConfigAdmin' // Added import


import { getCurrentRoute } from './routes'

export default function AppContent() {
  const route = getCurrentRoute()

  switch (route) {
  

    case 'portalConfig':
      return <ReturnPortalConfigAdmin /> // Added case route renderer

    case 'returns':
      return <Returns />

    case 'netsuite':
      return <NetSuite />

    case 'logs':
      return <Logs />



    case 'dashboard':
    default:
      return <Dashboard />
  }
}