import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import {
  Chain,
  Transfer,
  accountNonce,
  appendTransfer,
  createAccount,
  createGenesis,
  currencyInfo,
  currencyPositions,
  formatMinor,
  genesisHash,
  HOME_CURRENCY,
  isAccountAddress,
  listCurrencies,
  paymentsReceived,
  selectChain,
  validateChain,
  SOFTWARE_NAME,
  NETWORK_ID
} from "./index";

export interface NodeOptions {
  chainPath: string;
  walletPath: string;
  peerUrl?: string;
  port?: number;
}

export interface NodeState {
  chain: Chain;
  treasuryAddress: string;
}

const state: { chain: Chain | null; treasuryAddress: string; chainPath: string } = {
  chain: null,
  treasuryAddress: "",
  chainPath: ""
};

export function loadOrCreate(chainPath: string): NodeState {
  mkdirSync(dirname(chainPath), { recursive: true });
  if (existsSync(chainPath)) {
    const chain = JSON.parse(readFileSync(chainPath, "utf8")) as Chain;
    const error = validateChain(chain);
    if (error) {
      throw new Error(error);
    }
    state.chain = chain;
    state.chainPath = chainPath;
    state.treasuryAddress = chain.treasury;
    return { chain, treasuryAddress: chain.treasury };
  }
  const treasury = createAccount();
  const keyPath = `${chainPath}.treasury.key`;
  writeFileSync(keyPath, `${treasury.publicKey}\n${treasury.privateKey}\n`, { mode: 0o600 });
  const chain = createGenesis(treasury.publicKey, 1, 1);
  writeFileSync(chainPath, JSON.stringify(chain), { mode: 0o600 });
  state.chain = chain;
  state.chainPath = chainPath;
  state.treasuryAddress = treasury.publicKey;
  return { chain, treasuryAddress: treasury.publicKey };
}

export function saveChain(chain: Chain): void {
  writeFileSync(state.chainPath, JSON.stringify(chain), { mode: 0o600 });
  state.chain = chain;
}

export function currentChain(): Chain {
  if (!state.chain) {
    throw new Error("ARCHAIOS_NODE_NOT_READY");
  }
  return state.chain;
}

export async function pullPeer(peerUrl: string): Promise<boolean> {
  const response = await fetch(peerUrl);
  if (!response.ok) {
    return false;
  }
  const remote = await response.json() as Chain;
  const chosen = selectChain(currentChain(), remote);
  if (chosen !== currentChain() && genesisHash(chosen) === genesisHash(currentChain())) {
    saveChain(chosen);
    return true;
  }
  if (!existsSync(state.chainPath) && validateChain(remote) === null) {
    saveChain(remote);
    return true;
  }
  return false;
}

export function acceptTransfer(transfer: Transfer): { ok: true; height: number; hash: string } | { ok: false; error: string } {
  if ("privateKey" in (transfer as unknown as Record<string, unknown>)) {
    return { ok: false, error: "ARCHAIOS_PRIVATE_KEY_REFUSED" };
  }
  try {
    const next = appendTransfer(currentChain(), transfer, state.treasuryAddress || transfer.to, Date.now());
    saveChain(next);
    const tip = next.blocks[next.blocks.length - 1];
    return { ok: true, height: tip.index, hash: tip.hash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ARCHAIOS_REJECTED" };
  }
}

export function acceptRemoteChain(remote: Chain): { ok: boolean; adopted: boolean; error?: string } {
  const error = validateChain(remote);
  if (error) {
    return { ok: false, adopted: false, error };
  }
  if (genesisHash(remote) !== genesisHash(currentChain())) {
    return { ok: false, adopted: false, error: "ARCHAIOS_DIFFERENT_GENESIS" };
  }
  const chosen = selectChain(currentChain(), remote);
  const adopted = chosen !== currentChain();
  if (adopted) {
    saveChain(chosen);
  }
  return { ok: true, adopted };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store"
  });
  res.end(raw);
}

function receivedView(address: string, currency: string): { ok: true; body: unknown } | { ok: false; error: string } {
  if (!isAccountAddress(address)) {
    return { ok: false, error: "ARCHAIOS_BAD_ADDRESS" };
  }
  if (currency && !currencyInfo(currency)) {
    return { ok: false, error: "ARCHAIOS_BAD_CURRENCY" };
  }
  const chain = currentChain();
  const payments = paymentsReceived(chain, address, currency).map((transfer) => ({
    from: transfer.from,
    amount: transfer.amount,
    currency: transfer.currency,
    display: formatMinor(transfer.amount, transfer.currency),
    nonce: transfer.nonce,
    assetId: transfer.assetId
  }));
  const positions = currencyPositions(chain, address)
    .filter((row) => !currency || row.currency === currency)
    .map((row) => ({
      currency: row.currency,
      name: currencyInfo(row.currency)?.name ?? "",
      exponent: currencyInfo(row.currency)?.exponent ?? 0,
      received: row.received,
      sent: row.sent,
      displayReceived: formatMinor(row.received, row.currency),
      displaySent: formatMinor(row.sent, row.currency)
    }));
  return {
    ok: true,
    body: {
      address,
      currency: currency || null,
      homeCurrency: HOME_CURRENCY,
      nonce: accountNonce(chain, address),
      positions,
      payments
    }
  };
}

export async function startNode(options: NodeOptions): Promise<void> {
  if (!existsSync(options.chainPath) && options.peerUrl) {
    const response = await fetch(options.peerUrl);
    if (response.ok) {
      const remote = await response.json() as Chain;
      if (validateChain(remote) === null) {
        mkdirSync(dirname(options.chainPath), { recursive: true });
        writeFileSync(options.chainPath, JSON.stringify(remote), { mode: 0o600 });
      }
    }
  }
  loadOrCreate(options.chainPath);
  const wallet = readFileSync(options.walletPath, "utf8");
  const port = options.port ?? 3001;
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        send(res, 204, "");
        return;
      }
      const url = new URL(req.url ?? "/", "http://archaios.local");
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/wallet")) {
        send(res, 200, wallet, "text/html; charset=utf-8");
        return;
      }
      if (req.method === "GET" && url.pathname === "/health") {
        const chain = currentChain();
        send(res, 200, {
          software: SOFTWARE_NAME,
          networkId: NETWORK_ID,
          height: chain.blocks.length - 1,
          genesis: genesisHash(chain),
          treasury: chain.treasury,
          homeCurrency: HOME_CURRENCY
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/currencies") {
        send(res, 200, listCurrencies());
        return;
      }
      if (req.method === "GET" && url.pathname === "/chain") {
        send(res, 200, currentChain());
        return;
      }
      if (req.method === "GET" && (url.pathname === "/received" || url.pathname === "/balance")) {
        const view = receivedView(url.searchParams.get("address") ?? "", (url.searchParams.get("currency") ?? "").toUpperCase());
        send(res, view.ok ? 200 : 400, view.ok ? view.body : { error: view.error });
        return;
      }
      if (req.method === "POST" && url.pathname === "/transfer") {
        const transfer = JSON.parse(await readBody(req)) as Transfer;
        const result = acceptTransfer(transfer);
        send(res, result.ok ? 200 : 400, result);
        return;
      }
      if (req.method === "POST" && url.pathname === "/sync") {
        const remote = JSON.parse(await readBody(req)) as Chain;
        send(res, 200, acceptRemoteChain(remote));
        return;
      }
      send(res, 404, { error: "ARCHAIOS_NOT_FOUND" });
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : "ARCHAIOS_REJECTED" });
    }
  });
  server.listen(port, "0.0.0.0");
  if (options.peerUrl) {
    setInterval(() => {
      pullPeer(options.peerUrl as string).catch(() => undefined);
    }, 30_000);
  }
}

if (process.argv[1] && /node\.(ts|js)$/.test(process.argv[1])) {
  startNode({
    chainPath: process.env.ARCHAIOS_CHAIN_PATH ?? "/home/user/zhonnex-ecosystem-core/archaios/data/chain.json",
    walletPath: process.env.ARCHAIOS_WALLET_PATH ?? "/home/user/zhonnex-ecosystem-core/archaios/wallet.html",
    peerUrl: process.env.ARCHAIOS_PEER,
    port: Number(process.env.PORT ?? 3001)
  });
}