import { useState, useEffect } from 'react'

import '../styles/storefront.css'



import Alert from '../../components/ui/Alert'

import Button from '../../components/ui/Button'

import ReturnMethodSelector from '../components/returns/ReturnMethodSelector'

import ReturnFormFields from '../components/returns/ReturnFormFields'

import ReturnSuccess from '../components/returns/ReturnSuccess'

import { ArrowRightIcon } from '../../components/icons/AppIcons'



import {

  createReturnRequest,

  verifyWebsiteOrder,

  verifyAssistedOrder,

} from '../services/returnsApi'



import {

  getErrorMessage,

  INITIAL_ASSISTED_FORM,

  INITIAL_WEBSITE_FORM,

  validateReturnForm,

} from '../utils/validation'



const API_BASE_URL = (

  import.meta.env.VITE_RETURNS_API_BASE_URL || ''

).replace(/\/$/, '')



/**

* Helper to automatically append the storefront access token *

* from URL search parameters or sessionStorage.*

 */

function getStorefrontUrl(path) {

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



/**

* Helper to append access token to internal UI route links (like /return-status)*

 */

function getStorefrontStatusUrl(baseUrlPath) {

  const urlParams = new URLSearchParams(window.location.search)

  let accessParam = urlParams.get('access') || sessionStorage.getItem('storefront_access') || ''

  const separator = baseUrlPath.includes('?') ? '&' : '?'

  return `${baseUrlPath}${accessParam ? `${separator}access=${encodeURIComponent(accessParam)}` : ''}`

}



export default function ReturnRequest() {

  const [method, setMethod] = useState('website') // 'website' | 'assisted'



  const [websiteForm, setWebsiteForm] = useState(INITIAL_WEBSITE_FORM)

  const [assistedForm, setAssistedForm] = useState(INITIAL_ASSISTED_FORM)



  const [step, setStep] = useState('verify') // 'verify' | 'items'

  const [verifiedOrder, setVerifiedOrder] = useState(null)

  const [existingReturnPrompt, setExistingReturnPrompt] = useState(null)



  const [selectedItems, setSelectedItems] = useState({})



// Authentication & Verification States*

  const [isValidating, setIsValidating] = useState(true)

  const [isAccessAllowed, setIsAccessAllowed] = useState(false)

  const [accessErrorMsg, setAccessErrorMsg] = useState('')



// Dynamic Options State fetched from DB*

  const [portalConfig, setPortalConfig] = useState({

    reasons: [],

    resolutions: [],

    conditionQuestions: []

  })



// Step 2 Extended Forms*

  const [returnDetailsForm, setReturnDetailsForm] = useState({

    reason: '',

    requestedResolution: '',

    customerNote: '',

  })



// Dynamic Condition Form State*

  const [conditionForm, setConditionForm] = useState({})



// Attachment Files & Instant Previews*

  const [files, setFiles] = useState([])

  const [previews, setPreviews] = useState([])



  const [message, setMessage] = useState('')

  const [loading, setLoading] = useState(false)

  const [request, setRequest] = useState(null)



// Fetch dynamic configurations on mount with secure access token & 401 check*

  useEffect(() => {

    async function fetchConfig() {

      try {

        const targetUrl = getStorefrontUrl('/api/returns/portal-config')

        const response = await fetch(targetUrl, {

          headers: { Accept: 'application/json' }

        })

        const data = await response.json().catch(() => ({}))



        if (response.status === 401 || !response.ok || !data.success) {

          setIsAccessAllowed(false)

          setAccessErrorMsg(

            data.message || 'Direct access is not allowed. Please open the portal from your store link.'

          )

        } else {

          setIsAccessAllowed(true)

          if (data.data) {

            setPortalConfig(data.data)

            const initialConditions = {}

            if (Array.isArray(data.data.conditionQuestions)) {

              data.data.conditionQuestions.forEach(q => {

                initialConditions[q.value] = ''

              })

            }

            setConditionForm(initialConditions)

          }

        }

      } catch (err) {

        setIsAccessAllowed(false)

        setAccessErrorMsg('Unable to verify storefront access. Please try again later.')

      } finally {

        setIsValidating(false)

      }

    }

    fetchConfig()

  }, [])



  function updateForm(setter) {

    return (event) => {

      const { name, value } = event.target

      setter((current) => ({

        ...current,

        [name]: value,

      }))

      setMessage('')

      setExistingReturnPrompt(null)

    }

  }



  const updateWebsiteForm = updateForm(setWebsiteForm)

  const updateAssistedForm = updateForm(setAssistedForm)

  const updateReturnDetails = updateForm(setReturnDetailsForm)



  function handleMethodChange(nextMethod) {

    if (loading) return

    setMethod(nextMethod)

    setMessage('')

    setRequest(null)

    setStep('verify')

    setVerifiedOrder(null)

    setExistingReturnPrompt(null)

    setSelectedItems({})

  }



  function handleItemToggle(item) {

    setSelectedItems((prev) => {

      const isSelected = Boolean(prev[item.id]?.selected)

      if (isSelected) {

        const updated = { ...prev }

        delete updated[item.id]

        return updated

      } else {

        return {

          ...prev,

          [item.id]: {

            selected: true,

            lineItemId: item.id,

            productId: item.productId,

            variantId: item.variantId,

            title: item.title,

            variantTitle: item.variantTitle,

            sku: item.sku,

            quantity: 1,

            maxQuantity: Number(item.quantity || 1),

          },

        }

      }

    })

    setMessage('')

  }



  function handleQuantityChange(itemId, newQty) {

    const qtyNum = Number(newQty)

    setSelectedItems((prev) => {

      if (!prev[itemId]) return prev

      const maxQty = prev[itemId].maxQuantity

      const validQty = Math.max(1, Math.min(qtyNum, maxQty))

      return {

        ...prev,

        [itemId]: {

          ...prev[itemId],

          quantity: validQty,

        },

      }

    })

  }



  function handleFileChange(e) {

    const selectedFiles = Array.from(e.target.files || [])

    if (selectedFiles.length === 0) return



    const newFiles = [...files, ...selectedFiles]

    setFiles(newFiles)



    const newPreviews = selectedFiles.map((file) => ({

      name: file.name,

      type: file.type,

      url: URL.createObjectURL(file),

    }))



    setPreviews((prev) => [...prev, ...newPreviews])

  }



  function handleRemoveFile(index) {

    setFiles((prev) => prev.filter((_, i) => i !== index))

    setPreviews((prev) => {

      URL.revokeObjectURL(prev[index]?.url)

      return prev.filter((_, i) => i !== index)

    })

  }



  async function handleVerifyOrSubmit(event) {

    event.preventDefault()

    setMessage('')



    if (step === 'verify') {

      const validationError = validateReturnForm(method, websiteForm, assistedForm)

      if (validationError) {

        setMessage(validationError)

        return

      }



      setLoading(true)



      try {

        let verification = null

        let userEmail = ''

        let activeOrderNum = ''



        if (method === 'website') {

          activeOrderNum = String(websiteForm.orderNumber || '').trim()

          userEmail = String(websiteForm.email || '').trim()



          verification = await verifyWebsiteOrder({

            orderNumber: activeOrderNum,

            email: userEmail,

          })

        } else {

// Assisted (NetSuite) verification using Customer ID, Invoice Number, and Email*

          activeOrderNum = String(assistedForm.invoiceNumber || '').trim()

          userEmail = String(assistedForm.email || '').trim()

          const customerId = String(assistedForm.customerId || '').trim()



          verification = await verifyAssistedOrder({

            customerId: customerId,

            invoiceNumber: activeOrderNum,

            email: userEmail,

          })

        }



        if (verification.existingReturn) {

          const retNum = verification.existingReturn.returnNumber || verification.existingReturn.return_number || ''

          const emailForUrl = String(userEmail).toLowerCase()

          const encNum = encodeURIComponent(retNum)

          const encEmail = encodeURIComponent(emailForUrl)

          const rawStatusUrl = `${window.location.origin}/return-status?returnNumber=${encNum}&email=${encEmail}`

          const formattedStatusUrl = getStorefrontStatusUrl(rawStatusUrl)



          setExistingReturnPrompt({

            message: 'An active return request is already associated with this order/invoice.',

            returnNumber: retNum,

            statusUrl: formattedStatusUrl,

          })

          setLoading(false)

          return

        }



        const orderData = verification.order || {}

        const itemsList = Array.isArray(orderData.items) ? orderData.items : []



        if (itemsList.length === 0) {

          setMessage('No returnable items found for this order/invoice.')

          setLoading(false)

          return

        }



        setVerifiedOrder(orderData)



        const initialSelection = {}

        itemsList.forEach((item) => {

          initialSelection[item.id] = {

            selected: true,

            lineItemId: item.id,

            productId: item.productId,

            variantId: item.variantId,

            title: item.title,

            variantTitle: item.variantTitle,

            sku: item.sku,

            quantity: Number(item.quantity || 1),

            maxQuantity: Number(item.quantity || 1),

          }

        })

        setSelectedItems(initialSelection)

        setStep('items')

      } catch (error) {

        setMessage(getErrorMessage(error))

      } finally {

        if (!existingReturnPrompt) {

          setLoading(false)

        }

      }

    } else {

      const itemsToReturn = Object.values(selectedItems)

        .filter((item) => item.selected)

        .map((item) => ({

          lineItemId: item.lineItemId,

          productId: item.productId,

          variantId: item.variantId,

          title: item.title,

          variantTitle: item.variantTitle,

          sku: item.sku,

          quantity: item.quantity,

        }))



      if (itemsToReturn.length === 0) {

        setMessage('Please select at least one item to return.')

        return

      }



      if (!returnDetailsForm.reason.trim()) {

        setMessage('Please select a valid reason for your return.')

        return

      }



      if (!returnDetailsForm.requestedResolution) {

        setMessage('Please select a requested resolution action.')

        return

      }



      const unassignedCondition = Object.values(conditionForm).some(val => val === '')

      if (portalConfig.conditionQuestions.length > 0 && unassignedCondition) {

        setMessage('Please answer all Item Condition questions.')

        return

      }



      const verifiedEmail = String(websiteForm.email || assistedForm.email || '').trim()

      if (!verifiedEmail) {

        setMessage('Customer email is missing. Please restart verification.')

        return

      }



      setLoading(true)



      try {

        const formData = new FormData()

        formData.append('email', verifiedEmail)



        const isWebsiteOrder = method === 'website'
       const customer = verifiedOrder?.customer || {}
       const customerId = String(
         isWebsiteOrder
           ? (verifiedOrder?.customerId ?? customer.id ?? customer.customerId ?? '')
           : (assistedForm.customerId || verifiedOrder?.customerId || customer.id || customer.customerId || '')
       ).trim()
       const customerName = String(
         verifiedOrder?.customerName || customer.name ||
         [customer.firstName, customer.lastName].filter(Boolean).join(' ') || ''
       ).trim()

       const payloadData = {
         source: method,
         orderType: isWebsiteOrder ? 'shopify' : 'netsuite',
         orderNumber: String(
           verifiedOrder?.orderNumber || websiteForm.orderNumber || assistedForm.invoiceNumber || ''
         ).trim(),
         invoiceNumber: String(
           isWebsiteOrder
             ? (verifiedOrder?.invoiceNumber || '')
             : (assistedForm.invoiceNumber || verifiedOrder?.invoiceNumber || '')
         ).trim(),
         orderId: String(
           verifiedOrder?.orderId ?? verifiedOrder?.shopifyOrderId ?? verifiedOrder?.id ?? ''
         ),
         customerId,
         customerName,
         email: verifiedEmail,
         verifiedOrder,
         reason: returnDetailsForm.reason.trim(),
         requestedResolution: returnDetailsForm.requestedResolution,
         condition: { ...conditionForm },
         customerNote: returnDetailsForm.customerNote.trim(),
         items: itemsToReturn.map((item) => ({
           ...item,
           lineItemId: item.lineItemId,
           productId: item.productId,
           variantId: item.variantId,
           title: item.title,
           variantTitle: item.variantTitle,
           sku: item.sku,
           quantity: item.quantity,
         })),
         customerInputs: {
           website: isWebsiteOrder ? { ...websiteForm } : null,
           assisted: !isWebsiteOrder ? { ...assistedForm } : null,
         },
         submittedAt: new Date().toISOString(),
       }

       formData.append('data', JSON.stringify(payloadData))

        files.forEach((file) => formData.append('attachments', file))



        const result = await createReturnRequest(formData)

        handleSuccessResponse(result, result.existing === true)

      } catch (error) {

        setMessage(getErrorMessage(error))

      } finally {

        setLoading(false)

      }

    }

  }



function handleSuccessResponse(result, isExisting) {
    const customMessage = isExisting
      ? 'An active return request is already associated with this order/invoice.'
      : 'Your return request has been submitted successfully.'

    const returnNumber = result.returnNumber || result.return?.returnNumber || ''
    const userEmail = String(websiteForm.email || assistedForm.email || '').trim().toLowerCase()

    const encNumber = encodeURIComponent(returnNumber)
    const encEmail = encodeURIComponent(userEmail)
    
    const rawStatusUrl = `${window.location.origin}/return-status?returnNumber=${encNumber}&email=${encEmail}`
    const formattedStatusUrl = getStorefrontStatusUrl(result.statusUrl || rawStatusUrl)

    setRequest({
      returnId: result.returnId,
      statusUrl: formattedStatusUrl,
      message: customMessage,
      returnNumber: returnNumber,
      email: userEmail, // Ensure email is passed in request state
      status: result.status || result.return?.status || 'submitted',
      isExisting,
    })
  }


  function handleBackClick(e) {

    e.preventDefault()

    e.stopPropagation()

    setMessage('')

    setStep('verify')

  }



  if (isValidating) {

    return (

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb' }}>

        <p style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'sans-serif' }}>Verifying portal access...</p>

      </div>

    )

  }



  if (!isAccessAllowed) {

    return (

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f9fafb', padding: '16px' }}>

        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #fecaca', padding: '24px', maxWidth: '400px', width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#dc2626', margin: '0 0 8px 0', fontFamily: 'sans-serif' }}>

            Access Denied

          </h2>

          <p style={{ fontSize: '13px', color: '#4b5563', margin: 0, fontFamily: 'sans-serif', lineHeight: '1.4' }}>

            {accessErrorMsg}

          </p>

        </div>

      </div>

    )

  }



  if (request) {

    return (

      <main className="return-portal">

        <div className="return-container" style={{ maxWidth: '640px', margin: '0 auto', padding: '12px' }}>

          <ReturnSuccess request={request} onNewRequest={() => setRequest(null)} />

        </div>

      </main>

    )

  }



  return (

    <main className="return-portal">

      <div className="return-container" style={{ maxWidth: '640px', margin: '0 auto', padding: '12px' }}>

        <div className="return-intro" style={{ marginBottom: '12px', textAlign: 'left' }}>

          <p className="return-eyebrow" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#6b7280', marginBottom: '2px' }}>

            RETURNS &amp; SUPPORT

          </p>

          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0', lineHeight: '1.2' }}>

            How would you like to return?

          </h1>

          <p style={{ fontSize: '12px', color: '#4b5563', margin: 0 }}>

            Choose how you placed your order to get started with your return request.

          </p>

        </div>



        {step === 'verify' && (

          <ReturnMethodSelector method={method} onChange={handleMethodChange} disabled={loading} />

        )}



        <section className="return-form-card" style={{ padding: '14px 18px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>

          <div className="return-form-heading" style={{ marginBottom: '12px' }}>

            <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>

              {step === 'verify' ? 'Find your order' : 'Select Items & Reason'}

            </h2>

            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>

              {step === 'verify'

                ? 'Use your order/invoice number and email address to look up details.'

                : `Order/Invoice #${verifiedOrder?.orderNumber || websiteForm.orderNumber || assistedForm.invoiceNumber} verified. Choose items and specify return reason.`}

            </p>

          </div>



          <form onSubmit={handleVerifyOrSubmit} noValidate>

            {step === 'verify' ? (

              <div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '12px' }}>

                  <ReturnFormFields

                    method={method}

                    websiteForm={websiteForm}

                    assistedForm={assistedForm}

                    onWebsiteChange={updateWebsiteForm}

                    onAssistedChange={updateAssistedForm}

                    disabled={loading}

                  />

                </div>



                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>

                  <Button type="submit" loading={loading} loadingLabel="Verifying…" disabled={loading} className="return-button" style={{ padding: '7px 18px', height: '34px', fontSize: '12px', fontWeight: 600 }}>

                    <span>{loading ? 'Processing…' : 'Continue'}</span>

                    <ArrowRightIcon />

                  </Button>

                </div>

              </div>

            ) : (

              <div>

                <div className="return-details-step" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>

                  {/* ITEMS LIST (Same for both Website & Assisted) */}

                  <div className="form-group">

                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px', fontSize: '12px', color: '#374151' }}>

                      Select Items to Return <span >*</span>

                    </label>



                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>

                      {verifiedOrder?.items?.map((item, index) => {

                        const isSelected = Boolean(selectedItems[item.id]?.selected)

                        const currentQty = selectedItems[item.id]?.quantity || 1



                        return (

                          <div

                            key={item.id}

                            style={{

                              padding: '8px 12px',

                              borderBottom: index < verifiedOrder.items.length - 1 ? '1px solid #f3f4f6' : 'none',

                              display: 'flex',

                              alignItems: 'center',

                              justifyContent: 'space-between',

                              gap: '10px',

                              background: isSelected ? '#f9fafb' : '#fff',

                            }}

                          >

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>

                              <input

                                type="checkbox"

                                id={`item-${item.id}`}

                                checked={isSelected}

                                onChange={() => handleItemToggle(item)}

                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}

                              />

                              <label htmlFor={`item-${item.id}`} style={{ cursor: 'pointer', flex: 1 }}>

                                <div style={{ fontWeight: 600, fontSize: '12px', color: '#1f2937' }}>{item.title}</div>

                                {item.variantTitle && <div style={{ fontSize: '11px', color: '#666' }}>Variant: {item.variantTitle}</div>}

                              </label>

                            </div>



                            {isSelected && (

                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>

                                <label htmlFor={`qty-${item.id}`} style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>Qty:</label>

                                <select

                                  id={`qty-${item.id}`}

                                  value={currentQty}

                                  onChange={(e) => handleQuantityChange(item.id, e.target.value)}

                                  style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '12px' }}

                                >

                                  {Array.from({ length: Number(item.quantity || 1) }, (_, idx) => idx + 1).map((num) => (

                                    <option key={num} value={num}>{num}</option>

                                  ))}

                                </select>

                              </div>

                            )}

                          </div>

                        )

                      })}

                    </div>

                  </div>



                  {/* DYNAMIC REASONS & RESOLUTIONS DROPDOWNS */}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>

                    <div style={{ flex: '1 1 200px' }}>

                      <label htmlFor="reason" style={{ display: 'block', fontWeight: 600, marginBottom: '3px', fontSize: '12px', color: '#374151' }}>

                        Reason for Return <span >*</span>

                      </label>

                      <select

                        id="reason"

                        name="reason"

                        value={returnDetailsForm.reason}

                        onChange={updateReturnDetails}

                        required

                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px', outline: 'none' }}

                      >

                        <option value="">Select a reason...</option>

                        {portalConfig.reasons.map((r, i) => (

                          <option key={i} value={r.value}>{r.label}</option>

                        ))}

                      </select>

                    </div>



                    <div style={{ flex: '1 1 220px' }}>

                      <label htmlFor="requestedResolution" style={{ display: 'block', fontWeight: 600, marginBottom: '3px', fontSize: '12px', color: '#374151' }}>

                        Requested Resolution <span >*</span>

                      </label>

                      <select

                        id="requestedResolution"

                        name="requestedResolution"

                        value={returnDetailsForm.requestedResolution}

                        onChange={updateReturnDetails}

                        required

                        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px', outline: 'none' }}

                      >

                        <option value="">-- Select Action --</option>

                        {portalConfig.resolutions.map((res, i) => (

                          <option key={i} value={res.value}>{res.label}</option>

                        ))}

                      </select>

                    </div>

                  </div>



                  {/* DYNAMIC ITEM CONDITION QUESTIONS */}

                  {portalConfig.conditionQuestions.length > 0 && (

                    <div style={{ background: '#f9fafb', borderRadius: '6px', padding: '10px 12px', border: '1px solid #f3f4f6' }}>

                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: '8px' }}>

                        Item Condition Details

                      </span>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>

                        {portalConfig.conditionQuestions.map((q) => (

                          <div key={q.value} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>

                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>{q.label} *</span>

                            <div style={{ display: 'flex', gap: '10px' }}>

                              <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>

                                <input

                                  type="radio"

                                  name={q.value}

                                  value="yes"

                                  checked={conditionForm[q.value] === 'yes'}

                                  onChange={(e) => setConditionForm({ ...conditionForm, [q.value]: e.target.value })}

                                /> Yes

                              </label>

                              <label style={{ fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>

                                <input

                                  type="radio"

                                  name={q.value}

                                  value="no"

                                  checked={conditionForm[q.value] === 'no'}

                                  onChange={(e) => setConditionForm({ ...conditionForm, [q.value]: e.target.value })}

                                /> No

                              </label>

                            </div>

                          </div>

                        ))}



                      </div>

                    </div>

                  )}



                  {/* ATTACHMENTS */}

                  <div>

                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '3px', fontSize: '12px', color: '#374151' }}>

                      Attachments (Photos / Videos)

                    </label>

                    <input type="file" id="attachmentInput" accept="image/*,video/*" multiple onChange={handleFileChange} style={{ display: 'none' }} />

                    <label htmlFor="attachmentInput" style={{ display: 'block', border: '1px dashed #d1d5db', borderRadius: '6px', padding: '10px', textAlign: 'center', cursor: 'pointer', background: '#fafafa', fontSize: '12px', color: '#6b7280' }}>

                      📁 Click to upload photos or videos of the item

                    </label>



                    {previews.length > 0 && (

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>

                        {previews.map((item, idx) => (

                          <div key={idx} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e5e7eb', background: '#000' }}>

                            {item.type.startsWith('video') ? (

                              <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                            ) : (

                              <img src={item.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                            )}

                            <button type="button" onClick={() => handleRemoveFile(idx)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', fontSize: '10px', lineHeight: '1' }}>✕</button>

                          </div>

                        ))}

                      </div>

                    )}

                  </div>



                  {/* ADDITIONAL NOTES */}

                  <div>

                    <label htmlFor="customerNote" style={{ display: 'block', fontWeight: 600, marginBottom: '3px', fontSize: '12px', color: '#374151' }}>

                      Additional Notes (Optional)

                    </label>

                    <textarea

                      id="customerNote"

                      name="customerNote"

                      value={returnDetailsForm.customerNote}

                      onChange={updateReturnDetails}

                      placeholder="Provide any additional details or context for your return..."

                      rows={2}

                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}

                    />

                  </div>



                </div>



                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>

                  <Button type="button" onClick={handleBackClick} disabled={loading} className="return-button-secondary" style={{ background: '#f3f4f6', color: '#374151', padding: '6px 14px', fontSize: '12px' }}>

                    Back

                  </Button>

                  <Button type="submit" loading={loading} loadingLabel="Submitting…" disabled={loading} className="return-button" style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 600 }}>

                    <span>Submit Return Request</span>

                    <ArrowRightIcon />

                  </Button>

                </div>

              </div>

            )}



            {existingReturnPrompt && (

              <Alert type="warning" className="return-inline-alert" onDismiss={() => setExistingReturnPrompt(null)} style={{ fontSize: '12px', padding: '8px 12px', marginTop: '10px' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>

                  <span>{existingReturnPrompt.message}</span>

                  <div>

                    <a href={existingReturnPrompt.statusUrl} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}>

                      <span style={{ textDecoration: 'underline' }}>View existing return status ({existingReturnPrompt.returnNumber})</span> &rarr;

                    </a>

                  </div>

                </div>

              </Alert>

            )}



            {message && (

              <Alert type="error" className="return-inline-alert" onDismiss={() => setMessage('')} style={{ fontSize: '12px', padding: '8px 12px', marginTop: '10px' }}>

                {message}

              </Alert>

            )}



            <p className="return-privacy-note" style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px', textAlign: 'center' }}>

              {step === 'verify' ? 'Your details will be verified securely before processing.' : 'Once submitted, you can track your return progress at any time.'}

            </p>

          </form>

        </section>

      </div>

    </main>

  )

}