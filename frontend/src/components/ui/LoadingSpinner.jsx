export default function LoadingSpinner({ label = 'Loading...', size = 'medium' }) {
  const dimension = size === 'small' ? 14 : 22

  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: dimension,
        height: dimension,
        border: '2px solid #ccc',
        borderTopColor: '#333',
        borderRadius: '50%',
        animation: 'returns-spinner 0.7s linear infinite',
        verticalAlign: 'middle',
      }}
    >
      <style>{`
        @keyframes returns-spinner {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  )
}
