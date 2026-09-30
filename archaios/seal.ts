import { webcrypto } from "crypto";

export const KEY_FILE_HEADER = "archaios-key-1";
export const CHAIN_FILE_HEADER = "archaios-chain-1";
export const SEAL_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 12;

export async function sealPrivateKey(publicKey: string, privateKey: string, passphrase: string): Promise<string> {
  assertPassphrase(passphrase);
  if (!isHex(publicKey, 32) || !isHex(privateKey, 32)) {
    throw new Error("ARCHAIOS_BAD_KEY");
  }
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await deriveSealKey(passphrase, salt);
  const sealed = await encryptBytes(key, bytesFromHex(privateKey));
  return [
    KEY_FILE_HEADER,
    publicKey,
    String(SEAL_ITERATIONS),
    hex(salt),
    hex(sealed.iv),
    hex(sealed.cipher)
  ].join("\n") + "\n";
}

export async function openPrivateKey(fileText: string, passphrase: string): Promise<{ publicKey: string; privateKey: string }> {
  const parts = fileText.trim().split(/\s+/);
  if (parts.length !== 6 || parts[0] !== KEY_FILE_HEADER || parts[2] !== String(SEAL_ITERATIONS)) {
    throw new Error("ARCHAIOS_BAD_KEY_FILE");
  }
  const publicKey = parts[1];
  if (!isHex(publicKey, 32)) {
    throw new Error("ARCHAIOS_BAD_KEY_FILE");
  }
  const key = await deriveSealKey(passphrase, bytesFromHex(parts[3]));
  try {
    const plain = await decryptBytes(key, bytesFromHex(parts[4]), bytesFromHex(parts[5]));
    return { publicKey, privateKey: hex(plain) };
  } catch (error) {
    if (error instanceof Error && error.message === "ARCHAIOS_BAD_PASSPHRASE") {
      throw error;
    }
    throw new Error("ARCHAIOS_BAD_PASSPHRASE");
  }
}

export async function createChainSeal(json: string, passphrase: string): Promise<{ text: string; key: CryptoKey; salt: Uint8Array }> {
  assertPassphrase(passphrase);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await deriveSealKey(passphrase, salt);
  const text = await sealChainWithKey(json, key, salt);
  return { text, key, salt };
}

export async function openChain(fileText: string, passphrase: string): Promise<{ json: string; key: CryptoKey; salt: Uint8Array }> {
  const parts = fileText.trim().split(/\s+/);
  if (parts.length !== 5 || parts[0] !== CHAIN_FILE_HEADER || parts[1] !== String(SEAL_ITERATIONS)) {
    throw new Error(fileText.trim().startsWith("{") ? "ARCHAIOS_CHAIN_NOT_ENCRYPTED" : "ARCHAIOS_BAD_CHAIN_FILE");
  }
  const salt = bytesFromHex(parts[2]);
  const key = await deriveSealKey(passphrase, salt);
  const plain = await decryptBytes(key, bytesFromHex(parts[3]), bytesFromHex(parts[4]));
  return { json: Buffer.from(plain).toString("utf8"), key, salt };
}

export async function sealChainWithKey(json: string, key: CryptoKey, salt: Uint8Array): Promise<string> {
  const sealed = await encryptBytes(key, Buffer.from(json, "utf8"));
  return [
    CHAIN_FILE_HEADER,
    String(SEAL_ITERATIONS),
    hex(salt),
    hex(sealed.iv),
    hex(sealed.cipher)
  ].join("\n") + "\n";
}

export async function deriveSealKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  assertPassphrase(passphrase);
  const base = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: SEAL_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<{ iv: Uint8Array; cipher: Uint8Array }> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return { iv, cipher };
}

async function decryptBytes(key: CryptoKey, iv: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> {
  try {
    return new Uint8Array(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher));
  } catch {
    throw new Error("ARCHAIOS_BAD_PASSPHRASE");
  }
}

function assertPassphrase(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE) {
    throw new Error("ARCHAIOS_KEY_PASSPHRASE_REQUIRED");
  }
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function bytesFromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error("ARCHAIOS_BAD_KEY_FILE");
  }
  return Buffer.from(value, "hex");
}

function isHex(value: string, bytes: number): boolean {
  return new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value);
}