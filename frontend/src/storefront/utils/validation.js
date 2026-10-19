export const INITIAL_WEBSITE_FORM = { orderNumber: '', email: '' }
export const INITIAL_ASSISTED_FORM = { customerId: '', invoiceNumber: '', email: '' }
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function validateEmail(email) { return EMAIL_PATTERN.test(String(email || '').trim()) }
export function validateReturnForm(method, websiteForm, assistedForm) {
  if (method === 'website') {
    if (!websiteForm.orderNumber.trim() || !websiteForm.email.trim()) return 'Please enter your order number and checkout email.'
    if (!validateEmail(websiteForm.email)) return 'Please enter a valid email address.'
    return ''
  }
  if (!assistedForm.customerId.trim() || !assistedForm.invoiceNumber.trim() || !assistedForm.email.trim()) return 'Please complete all required fields.'
  if (!validateEmail(assistedForm.email)) return 'Please enter a valid email address.'
  return ''
}
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') { return error instanceof Error && error.message ? error.message : fallback }
