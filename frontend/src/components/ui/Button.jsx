import LoadingSpinner from './LoadingSpinner'

export default function Button({
  children,
  onClick,
  type = 'button',
  disabled = false,
  loading = false,
  variant = 'primary',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: 6,
        border: variant === 'secondary' ? '1px solid #ccc' : '1px solid #303030',
        background: variant === 'secondary' ? '#fff' : '#303030',
        color: variant === 'secondary' ? '#222' : '#fff',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.65 : 1,
      }}
    >
      {loading && <LoadingSpinner size="small" />}
      {children}
    </button>
  )
}
