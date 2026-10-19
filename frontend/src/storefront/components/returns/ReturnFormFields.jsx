import FormField from '../../../components/ui/FormField'

export default function ReturnFormFields({
  method,
  websiteForm,
  assistedForm,
  onWebsiteChange,
  onAssistedChange,
  disabled
}) {
  if (method === 'website') {
    return (
      <>
        <div style={{ flex: '1 1 180px' }}>
          <FormField
            id="return-order-number"
            label="Order Number"
            name="orderNumber"
            value={websiteForm.orderNumber}
            onChange={onWebsiteChange}
            placeholder="e.g. 10582 or #10582"
            disabled={disabled}
          />
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <FormField
            id="return-website-email"
            label="Email Address"
            name="email"
            type="email"
            value={websiteForm.email}
            onChange={onWebsiteChange}
            placeholder="Email used at checkout"
            autoComplete="email"
            disabled={disabled}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <div style={{ flex: '1 1 130px' }}>
        <FormField
          id="return-customer-id"
          label="Customer ID"
          name="customerId"
          value={assistedForm.customerId}
          onChange={onAssistedChange}
          placeholder="Customer ID"
          disabled={disabled}
        />
      </div>

      <div style={{ flex: '1 1 130px' }}>
        <FormField
          id="return-invoice-number"
          label="Invoice Number"
          name="invoiceNumber"
          value={assistedForm.invoiceNumber}
          onChange={onAssistedChange}
          placeholder="e.g. INV-24891"
          disabled={disabled}
        />
      </div>

      <div style={{ flex: '1 1 180px' }}>
        <FormField
          id="return-assisted-email"
          label="Contact Email Address"
          name="email"
          type="email"
          value={assistedForm.email}
          onChange={onAssistedChange}
          placeholder="Your contact email"
          autoComplete="email"
          disabled={disabled}
        />
      </div>
    </>
  )
}