import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual
} from 'crypto';

/* Seven real AES-256-GCM layers.
 * One master key stays in the server environment.
 * HKDF derives a different key for each layer.
 * This does not make the master key seven times longer.
 * If that one key leaks, every layer opens.
 */

const LAYERS = 7;
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = Buffer.from([0x07]);
const INFO_PREFIX = 'zhonnex-seal-v1-layer-';

export function masterKeyFromEnv(raw = process.env.ZHONNEX_ENCRYPTION_MASTER_KEY): Buffer {
  if (!raw || raw.trim().length < 32) {
    throw new Error(
      'CRITICAL ARCHITECTURE CONFIGURATION ERROR: ZHONNEX_ENCRYPTION_MASTER_KEY must be at least 32 characters and must not live in source.'
    );
  }
  return Buffer.from(raw, 'utf8');
}

function layerKey(master: Buffer, index: number): Buffer {
  const derived = hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from(`${INFO_PREFIX}${index}`), KEY_LENGTH);
  return Buffer.from(derived);
}

function sealLayer(plaintext: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ciphertext]);
}

function openLayer(sealed: Buffer, key: Buffer): Buffer {
  if (sealed.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new Error('SEAL REJECTED: layer payload is truncated.');
  }
  const nonce = sealed.subarray(0, NONCE_LENGTH);
  const tag = sealed.subarray(NONCE_LENGTH, NONCE_LENGTH + TAG_LENGTH);
  const ciphertext = sealed.subarray(NONCE_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypt a string through all seven layers. Returns base64. */
export function sealSevenLayers(plaintext: string, master = masterKeyFromEnv()): string {
  let current = Buffer.from(plaintext, 'utf8');
  for (let index = 0; index < LAYERS; index += 1) {
    current = sealLayer(current, layerKey(master, index));
  }
  return Buffer.concat([VERSION, current]).toString('base64');
}

/** Decrypt a sealSevenLayers() value. Layers open in reverse. */
export function openSevenLayers(sealed: string, master = masterKeyFromEnv()): string {
  const packed = Buffer.from(sealed, 'base64');
  if (packed.length < 1 + NONCE_LENGTH + TAG_LENGTH || !timingSafeEqual(packed.subarray(0, 1), VERSION)) {
    throw new Error('SEAL REJECTED: not a Zhonnex seven-layer seal.');
  }
  let current = packed.subarray(1);
  for (let index = LAYERS - 1; index >= 0; index -= 1) {
    current = openLayer(current, layerKey(master, index));
  }
  return current.toString('utf8');
}