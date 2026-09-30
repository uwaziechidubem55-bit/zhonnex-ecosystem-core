const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];

const ROT = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14
];

const MASK = 0xffffffffffffffffn;

function rotl(value: bigint, bits: number): bigint {
  const shift = BigInt(bits);
  return ((value << shift) | (value >> (64n - shift))) & MASK;
}

function keccakF(state: bigint[]): void {
  for (let round = 0; round < 24; round += 1) {
    const c = [0n, 0n, 0n, 0n, 0n];
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] ^= d;
    }
    const b = new Array<bigint>(25);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const nx = y;
        const ny = (2 * x + 3 * y) % 5;
        b[nx + 5 * ny] = rotl(state[x + 5 * y], ROT[x + 5 * y]);
      }
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const i = x + 5 * y;
        state[i] = b[i] ^ ((~b[((x + 1) % 5) + 5 * y] & MASK) & b[((x + 2) % 5) + 5 * y]);
      }
    }
    state[0] ^= RC[round];
  }
}

function readLane(bytes: Uint8Array, offset: number): bigint {
  let lane = 0n;
  for (let i = 0; i < 8; i += 1) {
    lane |= BigInt(bytes[offset + i] ?? 0) << BigInt(8 * i);
  }
  return lane;
}

function writeLane(bytes: Uint8Array, offset: number, lane: bigint): void {
  for (let i = 0; i < 8; i += 1) {
    bytes[offset + i] = Number((lane >> BigInt(8 * i)) & 0xffn);
  }
}

/** Ethereum Keccak-256. Not NIST SHA3-256. ERC-20 uses the first 4 bytes of this. */
export function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136;
  const paddedLength = Math.ceil((data.length + 1) / rate) * rate;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[paddedLength - 1] ^= 0x80;
  const state = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let lane = 0; lane < rate / 8; lane += 1) {
      state[lane] ^= readLane(padded, offset + lane * 8);
    }
    keccakF(state);
  }
  const out = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane += 1) {
    writeLane(out, lane * 8, state[lane]);
  }
  return out;
}

export function keccak256Hex(text: string): string {
  return Buffer.from(keccak256(Buffer.from(text, "utf8"))).toString("hex");
}

export function functionSelector(signature: string): string {
  return keccak256Hex(signature).slice(0, 8);
}