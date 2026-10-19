import Dashboard from '../admin/pages/Dashboard'
import Returns from '../admin/pages/Returns'
import NetSuite from '../admin/pages/NetSuite'

import Logs from '../admin/pages/Logs'
import ReturnPortalConfigAdmin from '../admin/pages/ReturnPortalConfigAdmin' // Added import
import ReturnRequest from '../storefront/pages/ReturnRequest'
import ReturnStatus from '../storefront/pages/ReturnStatus'

import { getCurrentRoute } from './routes'

export default function AppContent() {
  const route = getCurrentRoute()

  switch (route) {
    case 'returnRequest':
      return <ReturnRequest />

    case 'returnStatus':
      return <ReturnStatus />

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