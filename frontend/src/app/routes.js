export const ROUTES = {
  dashboard: '/dashboard',
  returns: '/returns',
  netsuite: '/netsuite',
  logs: '/logs',

  returnRequest: '/return-request',
  returnStatus: '/return-status',
  portalConfig: '/admin/returns/config', 
}

export function getCurrentRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'

  if (pathname === ROUTES.returnStatus || pathname.includes('/return-status')) {
    return 'returnStatus'
  }
  if (pathname === ROUTES.returnRequest || pathname.includes('/return-request')) {
    return 'returnRequest'
  }
  if (pathname === ROUTES.portalConfig || pathname.includes('/admin/returns/config')) {
    return 'portalConfig'
  }
  if (pathname.includes('/returns')) {
    return 'returns'
  }
  if (pathname.includes('/netsuite')) {
    return 'netsuite'
  }
  if (pathname.includes('/logs')) {
    return 'logs'
  }


  return 'dashboard'
}