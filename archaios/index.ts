import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from "crypto";
import { currencyInfo, HOME_CURRENCY } from "./currencies";

/** Archaios. The eighth Zhonnex software. A hash-linked record of currency payments, beside the product vault, not inside it. */
export const SOFTWARE_NAME = "Archaios";
export const NETWORK_ID = "archaios-1";
export const GENESIS_PREVIOUS = "0".repeat(64);
export { HOME_CURRENCY, currencyInfo, listCurrencies } from "./currencies";

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface Transfer {
  from: string;
  to: string;
  amount: number;
  currency: string;
  nonce: number;
  assetId: string;
  signature: string;
}

export interface Block {
  index: number;
  previousHash: string;
  timestamp: number;
  transfers: Transfer[];
  nonce: number;
  miner: string;
  hash: string;
}

export interface Chain {
  networkId: string;
  difficulty: number;
  treasury: string;
  blocks: Block[];
}

export interface Account {
  publicKey: string;
  privateKey: string;
}

export interface CurrencyPosition {
  currency: string;
  received: number;
  sent: number;
}

export function createAccount(): Account {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "der", type: "spki" });
  const priv = privateKey.export({ format: "der", type: "pkcs8" });
  return {
    publicKey: Buffer.from(pub).subarray(-32).toString("hex"),
    privateKey: Buffer.from(priv).subarray(-32).toString("hex")
  };
}

export function transferMessage(networkId: string, transfer: Omit<Transfer, "signature">): string {
  return [
    "archaios-transfer",
    networkId,
    transfer.from,
    transfer.to,
    String(transfer.amount),
    transfer.currency,
    String(transfer.nonce),
    transfer.assetId
  ].join("|");
}

export function ownershipMessage(networkId: string, userId: string, assetId: string): string {
  return ["archaios-owner", networkId, userId, assetId].join("|");
}

export function signBytes(message: string, privateKeyHex: string): string {
  return sign(null, Buffer.from(message, "utf8"), privateKeyFromHex(privateKeyHex)).toString("hex");
}

export function verifyBytes(message: string, signatureHex: string, publicKeyHex: string): boolean {
  if (!isHex(publicKeyHex, 32) || !isHex(signatureHex, 64)) {
    return false;
  }
  return verify(
    null,
    Buffer.from(message, "utf8"),
    publicKeyFromHex(publicKeyHex),
    Buffer.from(signatureHex, "hex")
  );
}

export function signTransfer(
  networkId: string,
  transfer: Omit<Transfer, "signature">,
  privateKeyHex: string
): Transfer {
  return {
    ...transfer,
    signature: signBytes(transferMessage(networkId, transfer), privateKeyHex)
  };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Fixed field order so a node in another country hashes the same bytes. */
export function canonicalTransfer(transfer: Transfer): string {
  return JSON.stringify([
    transfer.from,
    transfer.to,
    transfer.amount,
    transfer.currency,
    transfer.nonce,
    transfer.assetId,
    transfer.signature
  ]);
}

export function blockHash(chain: Pick<Chain, "networkId" | "treasury">, block: Omit<Block, "hash">): string {
  const body = [
    chain.networkId,
    block.index === 0 ? chain.treasury : "",
    String(block.index),
    block.previousHash,
    String(block.timestamp),
    block.transfers.map(canonicalTransfer).join(","),
    String(block.nonce),
    block.miner
  ].join("|");
  return sha256(body);
}

export function genesisHash(chain: Chain): string {
  return chain.blocks[0]?.hash ?? "";
}

export function mineBlock(
  chain: Pick<Chain, "networkId" | "difficulty" | "treasury">,
  draft: Omit<Block, "nonce" | "hash">
): Block {
  const difficulty = Math.max(0, chain.difficulty);
  let nonce = 0;
  while (nonce < 5_000_000) {
    const candidate = { ...draft, nonce };
    const hash = blockHash(chain, candidate);
    if (hash.startsWith("0".repeat(difficulty))) {
      return { ...candidate, hash };
    }
    nonce += 1;
  }
  throw new Error("ARCHAIOS_MINE_EXHAUSTED");
}

export function createGenesis(treasury: string, difficulty = 1, timestamp = 0): Chain {
  if (!isAddress(treasury)) {
    throw new Error("ARCHAIOS_BAD_ADDRESS");
  }
  const chain: Chain = {
    networkId: NETWORK_ID,
    difficulty,
    treasury,
    blocks: []
  };
  const block = mineBlock(chain, {
    index: 0,
    previousHash: GENESIS_PREVIOUS,
    timestamp,
    transfers: [],
    miner: treasury
  });
  chain.blocks.push(block);
  return chain;
}

/** Whole currency units in, minor units out. 1500.50 NGN is 150050 kobo. */
export function parseMajor(input: string, currency: string): number | null {
  const info = currencyInfo(currency);
  if (!info) {
    return null;
  }
  const text = input.trim().replace(/,/g, "");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    return null;
  }
  const [whole, frac = ""] = text.split(".");
  if (frac.length > info.exponent) {
    return null;
  }
  const minorText = `${whole}${frac.padEnd(info.exponent, "0")}`;
  if (minorText.length > 15) {
    return null;
  }
  const minor = Number(minorText);
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    return null;
  }
  return minor;
}

export function formatMinor(amount: number, currency: string): string | null {
  const info = currencyInfo(currency);
  if (!info || !Number.isInteger(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  const digits = String(amount).padStart(info.exponent + 1, "0");
  if (info.exponent === 0) {
    return digits;
  }
  return `${digits.slice(0, -info.exponent)}.${digits.slice(-info.exponent)}`;
}

export function accountNonce(chain: Chain, address: string): number {
  if (validateChain(chain)) {
    throw new Error("ARCHAIOS_REJECTED");
  }
  return countNonce(chain, address);
}

export function currencyPositions(chain: Chain, address: string): CurrencyPosition[] {
  if (validateChain(chain) || !isAddress(address)) {
    return [];
  }
  const totals = new Map<string, { received: number; sent: number }>();
  for (const block of chain.blocks) {
    for (const transfer of block.transfers) {
      if (transfer.to === address) {
        addPosition(totals, transfer.currency, transfer.amount, 0);
      }
      if (transfer.from === address) {
        addPosition(totals, transfer.currency, 0, transfer.amount);
      }
    }
  }
  return [...totals.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([currency, row]) => ({ currency, received: row.received, sent: row.sent }));
}

export function paymentsReceived(chain: Chain, address: string, currency = ""): Transfer[] {
  if (validateChain(chain) || !isAddress(address)) {
    return [];
  }
  if (currency && !currencyInfo(currency)) {
    return [];
  }
  const found: Transfer[] = [];
  for (const block of chain.blocks) {
    for (const transfer of block.transfers) {
      if (transfer.to === address && (!currency || transfer.currency === currency)) {
        found.push(transfer);
      }
    }
  }
  return found;
}

export function appendTransfer(chain: Chain, transfer: Transfer, miner: string, timestamp: number): Chain {
  const error = validateChain(chain);
  if (error) {
    throw new Error(error);
  }
  const next = structuredClone(chain) as Chain;
  const tip = next.blocks[next.blocks.length - 1];
  const block = mineBlock(next, {
    index: tip.index + 1,
    previousHash: tip.hash,
    timestamp,
    transfers: [transfer],
    miner
  });
  next.blocks.push(block);
  const appended = validateChain(next);
  if (appended) {
    throw new Error(appended);
  }
  return next;
}

export function validateChain(chain: Chain): string | null {
  if (chain.networkId !== NETWORK_ID) {
    return "ARCHAIOS_WRONG_NETWORK";
  }
  if (!Number.isInteger(chain.difficulty) || chain.difficulty < 0 || chain.difficulty > 6) {
    return "ARCHAIOS_BAD_DIFFICULTY";
  }
  if (!isAddress(chain.treasury)) {
    return "ARCHAIOS_BAD_ADDRESS";
  }
  if (chain.blocks.length === 0) {
    return "ARCHAIOS_EMPTY_CHAIN";
  }
  const seen = new Map<string, number>();
  for (let i = 0; i < chain.blocks.length; i += 1) {
    const block = chain.blocks[i];
    if (block.index !== i) {
      return "ARCHAIOS_BAD_INDEX";
    }
    const expectedPrevious = i === 0 ? GENESIS_PREVIOUS : chain.blocks[i - 1].hash;
    if (block.previousHash !== expectedPrevious) {
      return "ARCHAIOS_BROKEN_LINK";
    }
    if (block.hash !== blockHash(chain, block) || !block.hash.startsWith("0".repeat(chain.difficulty))) {
      return "ARCHAIOS_BAD_HASH";
    }
    if (i === 0 && block.transfers.length !== 0) {
      return "ARCHAIOS_GENESIS_HAS_TRANSFERS";
    }
    for (const transfer of block.transfers) {
      const reason = applyTransfer(chain.networkId, transfer, seen);
      if (reason) {
        return reason;
      }
    }
  }
  return null;
}

/** Longer valid chain wins. A different genesis, or an invalid remote chain, never replaces the local one. */
export function selectChain(local: Chain, remote: Chain): Chain {
  const remoteError = validateChain(remote);
  if (remoteError) {
    return local;
  }
  const localError = validateChain(local);
  if (localError) {
    return remote;
  }
  if (genesisHash(local) !== genesisHash(remote)) {
    return local;
  }
  return remote.blocks.length > local.blocks.length ? remote : local;
}

export function hasSettledProductPayment(
  chain: Chain,
  buyer: string,
  assetId: string,
  minAmount = 1,
  currency = HOME_CURRENCY
): boolean {
  if (validateChain(chain) || !assetId || !currencyInfo(currency)) {
    return false;
  }
  return chain.blocks.some((block) =>
    block.transfers.some(
      (transfer) =>
        transfer.from === buyer &&
        transfer.to === chain.treasury &&
        transfer.assetId === assetId &&
        transfer.currency === currency &&
        transfer.amount >= minAmount
    )
  );
}

export function isAccountAddress(value: string): boolean {
  return isAddress(value);
}

function countNonce(chain: Chain, address: string): number {
  let nonce = 0;
  for (const block of chain.blocks) {
    for (const transfer of block.transfers) {
      if (transfer.from === address) {
        nonce += 1;
      }
    }
  }
  return nonce;
}

function applyTransfer(
  networkId: string,
  transfer: Transfer,
  seen: Map<string, number>
): string | null {
  if (!isAddress(transfer.from) || !isAddress(transfer.to) || transfer.from === transfer.to) {
    return "ARCHAIOS_BAD_ADDRESS";
  }
  if (!currencyInfo(transfer.currency)) {
    return "ARCHAIOS_BAD_CURRENCY";
  }
  if (!isPositiveInt(transfer.amount) || !Number.isInteger(transfer.nonce) || transfer.nonce < 0) {
    return "ARCHAIOS_BAD_AMOUNT";
  }
  if (!verifyBytes(transferMessage(networkId, transfer), transfer.signature, transfer.from)) {
    return "ARCHAIOS_BAD_SIGNATURE";
  }
  const expected = seen.get(transfer.from) ?? 0;
  if (transfer.nonce !== expected) {
    return "ARCHAIOS_BAD_NONCE";
  }
  seen.set(transfer.from, expected + 1);
  return null;
}

function addPosition(
  totals: Map<string, { received: number; sent: number }>,
  currency: string,
  received: number,
  sent: number
): void {
  const row = totals.get(currency) ?? { received: 0, sent: 0 };
  row.received += received;
  row.sent += sent;
  totals.set(currency, row);
}

function privateKeyFromHex(hexKey: string) {
  if (!isHex(hexKey, 32)) {
    throw new Error("ARCHAIOS_BAD_PRIVATE_KEY");
  }
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(hexKey, "hex")]),
    format: "der",
    type: "pkcs8"
  });
}

function publicKeyFromHex(hexKey: string) {
  return createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, Buffer.from(hexKey, "hex")]),
    format: "der",
    type: "spki"
  });
}

function isAddress(value: string): boolean {
  return isHex(value, 32);
}

function isHex(value: string, bytes: number): boolean {
  return new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value);
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}