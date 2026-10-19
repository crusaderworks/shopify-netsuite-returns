// worker/src/utils/encryption.js

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;

function getBase64Key(env) {
  const value = env?.TOKEN_ENCRYPTION_KEY;

  if (!value) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured.');
  }

  const binary = atob(value);
  const keyBytes = Uint8Array.from(binary, (char) =>
    char.charCodeAt(0)
  );

  if (keyBytes.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.'
    );
  }

  return keyBytes;
}

async function importEncryptionKey(env, usage) {
  return crypto.subtle.importKey(
    'raw',
    getBase64Key(env),
    { name: ALGORITHM },
    false,
    usage
  );
}

function toBase64(bytes) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);

  return Uint8Array.from(binary, (char) =>
    char.charCodeAt(0)
  );
}

export async function encryptToken(token, env) {
  if (typeof token !== 'string' || !token.length) {
    throw new Error('Cannot encrypt an empty token.');
  }

  const key = await importEncryptionKey(env, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(token)
  );

  // Storage format: base64(12-byte IV + encrypted data).
  const combined = new Uint8Array(
    iv.length + encrypted.byteLength
  );

  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return toBase64(combined);
}

export async function decryptToken(encryptedToken, env) {
  if (
    typeof encryptedToken !== 'string' ||
    !encryptedToken.trim()
  ) {
    throw new Error('Encrypted token is missing.');
  }

  const combined = fromBase64(encryptedToken);

  if (combined.length <= IV_LENGTH) {
    throw new Error('Encrypted token has an invalid format.');
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const key = await importEncryptionKey(env, ['decrypt']);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error(
      'Unable to decrypt token. Check the encryption key and stored value.'
    );
  }
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(value ?? ''))
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function maskEmail(email = '') {
  const value = String(email);
  const at = value.indexOf('@');

  if (at < 1) {
    return value ? '[REDACTED]' : '';
  }

  return `${value.slice(0, 2)}***${value.slice(at)}`;
}