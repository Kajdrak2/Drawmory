import { HttpError } from './repository';
import { randomToken } from './tokens';

const ADMIN_COOKIE = 'dm_admin';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

function configured(name: 'DRAWMORY_ADMIN_CAPABILITY' | 'DRAWMORY_ADMIN_SESSION_SECRET') {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) {
    throw new HttpError(503, 'ADMIN_UNAVAILABLE', 'Owner administration is not configured.');
  }
  return value;
}

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(normalized + padding), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function constantTimeEqual(left: string, right: string) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

async function signingKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(configured('DRAWMORY_ADMIN_SESSION_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signature(payload: string) {
  const result = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(result));
}

function readCookie(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1) ?? null;
}

export async function verifyAdminCapability(capability: string) {
  if (!(await constantTimeEqual(capability, configured('DRAWMORY_ADMIN_CAPABILITY')))) {
    throw new HttpError(401, 'ADMIN_ACCESS_DENIED', 'This owner link is not valid.');
  }
}

export async function createAdminSessionCookie() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `v1.${expiresAt}.${randomToken(18)}`;
  const value = `${payload}.${await signature(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ADMIN_COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearAdminSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ADMIN_COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function requireAdmin(request: Request, mutation = false) {
  if (mutation) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      throw new HttpError(403, 'ADMIN_ORIGIN_REJECTED', 'This administration request was rejected.');
    }
  }

  const value = readCookie(request);
  const parts = value?.split('.') ?? [];
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new HttpError(401, 'ADMIN_SESSION_REQUIRED', 'Open your secret owner link to continue.');
  }
  const expiresAt = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'ADMIN_SESSION_EXPIRED', 'The owner session has expired.');
  }
  const payload = parts.slice(0, 3).join('.');
  const providedSignature = base64UrlToBytes(parts[3]);
  if (!providedSignature) {
    throw new HttpError(401, 'ADMIN_SESSION_INVALID', 'The owner session is invalid.');
  }
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(),
    providedSignature,
    encoder.encode(payload),
  );
  if (!valid) {
    throw new HttpError(401, 'ADMIN_SESSION_INVALID', 'The owner session is invalid.');
  }
}
