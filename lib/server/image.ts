import { SERVER_CONFIG } from './config';

export type ValidatedImage = {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/webp';
  extension: 'png' | 'webp';
  width: number;
  height: number;
  sha256: string;
};

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function dimensionsForPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    throw new Error('The PNG signature is invalid.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function dimensionsForWebp(bytes: Uint8Array) {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') {
    throw new Error('The WebP signature is invalid.');
  }

  const chunk = ascii(12, 4);
  if (chunk === 'VP8X') {
    return {
      width: readUint24LE(bytes, 24) + 1,
      height: readUint24LE(bytes, 27) + 1,
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }
  if (
    chunk === 'VP8 ' &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  throw new Error('The WebP dimensions could not be read.');
}

export async function validateDataImage(dataUrl: string): Promise<ValidatedImage> {
  const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Only PNG and WebP drawings are accepted.');
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(match[2]);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The drawing data is invalid.');
  }

  if (bytes.byteLength === 0 || bytes.byteLength > SERVER_CONFIG.maxImageBytes) {
    throw new Error('The drawing must be smaller than 1 MB.');
  }

  const mimeType = match[1] as ValidatedImage['mimeType'];
  const dimensions = mimeType === 'image/png' ? dimensionsForPng(bytes) : dimensionsForWebp(bytes);
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > SERVER_CONFIG.maxImageDimension ||
    dimensions.height > SERVER_CONFIG.maxImageDimension ||
    dimensions.width !== dimensions.height
  ) {
    throw new Error('The drawing must be square and no larger than 1024 pixels.');
  }

  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

  return {
    bytes,
    mimeType,
    extension: mimeType === 'image/webp' ? 'webp' : 'png',
    width: dimensions.width,
    height: dimensions.height,
    sha256,
  };
}
