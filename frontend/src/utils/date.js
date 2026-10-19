export function formatLocalDateTime(value) {
  if (!value) return '—';
  
  // Ensure string is parsed properly as UTC if it lacks 'Z'
  let normalizedValue = value;
  if (typeof value === 'string' && !value.endsWith('Z') && !value.includes('+')) {
    normalizedValue = value.replace(' ', 'T') + 'Z';
  }

  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatTimeAgo(value) {
  if (!value) return '—';

  let normalizedValue = value;
  if (typeof value === 'string' && !value.endsWith('Z') && !value.includes('+')) {
    normalizedValue = value.replace(' ', 'T') + 'Z';
  }

  const date = new Date(normalizedValue);
  const now = new Date();
  const secondsAgo = Math.floor((now - date) / 1000);

  if (Number.isNaN(secondsAgo)) return '—';

  if (secondsAgo < 5) return 'Just now';
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo} min${minutesAgo > 1 ? 's' : ''} ago`;
  
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
  
  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 30) return `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;

  // Fallback to local date string if older than a month
  return formatLocalDateTime(value);
}