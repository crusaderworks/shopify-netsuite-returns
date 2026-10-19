const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || ''
).replace(/\/$/, '')

/**
 * Helper to get and persist the storefront access token, 
 * then append it to the API endpoint query parameters.
 */
export function getStorefrontUrl(path) {
  const urlParams = new URLSearchParams(window.location.search)
  let accessParam = urlParams.get('access')

  if (accessParam) {
    sessionStorage.setItem('storefront_access', accessParam)
  } else {
    accessParam = sessionStorage.getItem('storefront_access')
  }

  const separator = path.includes('?') ? '&' : '?'
  return `${API_BASE_URL}${path}${accessParam ? `${separator}access=${encodeURIComponent(accessParam)}` : ''}`
}

async function postJson(path, payload, fallbackMessage) {
  if (!API_BASE_URL) {
    throw new Error(
      'Return API is not configured. Check VITE_RETURNS_API_BASE_URL.'
    )
  }

  const controller = new AbortController()

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, 15000)

  try {
    // Use getStorefrontUrl to automatically attach the access token query param
    const targetUrl = getStorefrontUrl(path)

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok || data.success !== true) {
      const error = new Error(
        data.message || fallbackMessage
      )

      error.status = response.status
      error.code = data.code || null

      throw error
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'Request timed out. Please try again.'
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Verify Website (Shopify) orders via Order Number and Email Address
 */
export function verifyWebsiteOrder(payload) {
  return postJson(
    '/api/storefront/orders/verify',
    {
      orderNumber: String(payload.orderNumber || '').trim(),
      email: String(payload.email || '').trim(),
    },
    'We could not verify your order. Please try again.'
  )
}

/**
 * Verify Assisted (NetSuite) orders via Customer ID, Invoice Number, and Email Address
 */
export function verifyAssistedOrder(payload) {
  return postJson(
    '/api/storefront/orders/verify-assisted',
    {
      customerId: String(payload.customerId || '').trim(),
      invoiceNumber: String(payload.invoiceNumber || '').trim(),
      email: String(payload.email || '').trim(),
    },
    'We could not verify your NetSuite invoice. Please check your Customer ID, Invoice Number, and Email Address.'
  )
}

/**
 * Create Return Request handling both Website and Assisted Sources
 */
export async function createReturnRequest(payload) {
  const isFormData = payload instanceof FormData

  if (!API_BASE_URL) {
    throw new Error(
      'Return API is not configured. Check VITE_RETURNS_API_BASE_URL.'
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    // Use getStorefrontUrl for create request endpoint
    const targetUrl = getStorefrontUrl('/api/returns/requests')
    const headers = isFormData
      ? { Accept: 'application/json' }
      : { 'Content-Type': 'application/json', Accept: 'application/json' }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: isFormData ? payload : JSON.stringify(payload),
      signal: controller.signal,
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok || data.success !== true) {
      const error = new Error(
        data.message || 'We could not register your return request. Please try again.'
      )
      error.status = response.status
      error.code = data.code || null
      throw error
    }

    const returnObject = data.return || data.returns || {}
    const returnId =
      data.returnId ||
      returnObject.id ||
      null

    if (!returnId) {
      throw new Error(
        'The server did not return an official return ID.'
      )
    }

    // Preserve access token for status page URL
    const urlParams = new URLSearchParams(window.location.search)
    let accessParam = urlParams.get('access') || sessionStorage.getItem('storefront_access') || ''
    const accessQuery = accessParam ? `&access=${encodeURIComponent(accessParam)}` : ''

    const rawStatusUrl =
      typeof data.statusUrl === 'string' && data.statusUrl.trim()
        ? data.statusUrl
        : `/return-status?returnId=${encodeURIComponent(returnId)}`

    const statusUrl = `${rawStatusUrl}${rawStatusUrl.includes('?') ? '' : '?'}${accessQuery}`

    return {
      ...data,
      returnId,
      existing: data.existing === true,
      returnNumber:
        data.returnNumber ||
        returnObject.returnNumber ||
        returnObject.return_number ||
        '',
      status:
        data.status ||
        returnObject.status ||
        'submitted',
      statusUrl,
      message:
        data.message ||
        (data.existing 
          ? 'A return request is already pending for this order/invoice.'
          : 'Your return request has been registered successfully.'),
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'Request timed out. Please try again.'
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}