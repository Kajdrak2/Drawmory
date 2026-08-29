const TOKEN_BYTES = 32;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomToken(bytes = TOKEN_BYTES) {
  const binary = Array.from(randomBytes(bytes), (value) => String.fromCharCode(value)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function randomSlug() {
  return randomToken(9).toLowerCase();
}

export function randomCode() {
  const bytes = randomBytes(6);
  const body = Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
  return `MORY-${body}`;
}

export function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
