import { NavigationMenu } from '@shopify/app-bridge-react'
import { ROUTES } from './routes'

export default function AppNavigation() {
  return (
    <NavigationMenu
      navigationLinks={[
        {
          label: 'Dashboard',
          destination: ROUTES.dashboard,
        },
        {
          label: 'Returns',
          destination: ROUTES.returns,
        },
        {
          label: 'Portal Config', // Added menu item
          destination: ROUTES.portalConfig,
        },
        {
          label: 'NetSuite',
          destination: ROUTES.netsuite,
        },
        {
          label: 'Activity Logs',
          destination: ROUTES.logs,
        },
        
      ]}
    />
  )
}