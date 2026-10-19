export default function Alert({ type = 'info', title, children }) {
  const styles = {
    error: { background: '#FDECEC', color: '#8B1E1E' },
    success: { background: '#E8F7ED', color: '#176B35' },
    warning: { background: '#FFF4D6', color: '#805B00' },
    info: { background: '#EAF3FF', color: '#174EA6' },
  }

  const style = styles[type] || styles.info

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: style.background,
        color: style.color,
        marginBottom: 16,
      }}
    >
      {title && <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>}
      <div>{children}</div>
    </div>
  )
}
