export default function FormField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
  error = '',
  hint = '',
  disabled = false,
  autoComplete,
  ...props
}) {
  const id = props.id || name

  return (
    <div style={{ marginBottom: 0, width: '100%' }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            marginBottom: 3,
            fontSize: 12,
            fontWeight: 600,
            color: '#374151',
          }}
        >
          {label}
          {required && <span style={{ color: '#dc2626' }} aria-hidden="true"> *</span>}
        </label>
      )}

      <input
        {...props}
        id={id}
        name={name}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        style={{
          boxSizing: 'border-box',
          display: 'block',
          width: '100%',
          height: 34,
          minHeight: 34,
          padding: '6px 10px',
          border: `1px solid ${error ? '#dc2626' : '#d1d5db'}`,
          borderRadius: 6,
          background: disabled ? '#f3f4f6' : '#FFFFFF',
          color: '#111827',
          fontSize: 13,
          outlineOffset: 1,
        }}
      />

      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          style={{ color: '#dc2626', fontSize: 11, margin: '2px 0 0' }}
        >
          {error}
        </p>
      )}

      {!error && hint && (
        <p
          id={`${id}-hint`}
          style={{ color: '#6b7280', fontSize: 11, margin: '2px 0 0' }}
        >
          {hint}
        </p>
      )}
    </div>
  )
}