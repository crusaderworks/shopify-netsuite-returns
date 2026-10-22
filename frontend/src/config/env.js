export const API_KEY = import.meta.env.VITE_SHOPIFY_API_KEY

export const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '')

