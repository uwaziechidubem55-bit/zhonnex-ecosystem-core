import { readFileSync } from "fs";
import {
  ERC20_TRANSFER_SELECTOR,
  OWNER_SELECTOR,
  PAYMENT_SELECTOR,
  appendTransfer,
  createAccount,
  createGenesis,
  formatMinor,
  genesisHash,
  hasSettledProductPayment,
  ownershipMessage,
  parseMajor,
  paymentsReceived,
  selectChain,
  signBytes,
  signTransfer,
  validateChain,
  verifyBytes
} from "./index";
import { openPrivateKey, sealPrivateKey } from "./seal";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  assert(ERC20_TRANSFER_SELECTOR === "a9059cbb", "ERC-20 transfer selector");
  assert(PAYMENT_SELECTOR === "70a8c498", "payment starting signature");
  assert(OWNER_SELECTOR === "af1469d7", "owner starting signature");
  assert(parseMajor("1500.50", "NGN") === 150050, "naira to kobo");
  assert(parseMajor("1500", "JPY") === 1500, "yen has no decimals");
  assert(parseMajor("10", "ARCH") === null, "private unit is not a currency");
  assert(formatMinor(150050, "NGN") === "1500.50", "kobo displayed as naira");

  const treasury = createAccount();
  const buyer = createAccount();
  const stranger = createAccount();
  const chain = createGenesis(treasury.publicKey, 1, 1);
  assert(validateChain(chain) === null, "genesis should validate");

  const paid = signTransfer(
    chain.networkId,
    genesisHash(chain),
    {
      from: buyer.publicKey,
      to: treasury.publicKey,
      amount: 150050,
      currency: "NGN",
      nonce: 0,
      assetId: "GLANCE-CHART-01"
    },
    buyer.privateKey
  );
  assert(paid.signature.startsWith(PAYMENT_SELECTOR), "signature starts with the payment selector");
  const afterPay = appendTransfer(chain, paid, treasury.publicKey, 2);
  assert(paymentsReceived(afterPay, treasury.publicKey, "NGN")[0].amount === 150050, "naira received");
  assert(hasSettledProductPayment(afterPay, buyer.publicKey, "GLANCE-CHART-01", 150050, "NGN"), "naira payment recorded");
  assert(!hasSettledProductPayment(afterPay, buyer.publicKey, "GLANCE-CHART-01", 1, "USD"), "dollars were not paid");

  const stripped = { ...paid, signature: paid.signature.slice(PAYMENT_SELECTOR.length) };
  let strippedRejected = false;
  try {
    appendTransfer(chain, stripped, treasury.publicKey, 3);
  } catch {
    strippedRejected = true;
  }
  assert(strippedRejected, "signature without the starting selector is rejected");

  const wrongGenesis = signTransfer(
    chain.networkId,
    "ab".repeat(32),
    {
      from: buyer.publicKey,
      to: treasury.publicKey,
      amount: 100,
      currency: "USD",
      nonce: 0,
      assetId: ""
    },
    buyer.privateKey
  );
  let genesisRejected = false;
  try {
    appendTransfer(chain, wrongGenesis, treasury.publicKey, 3);
  } catch {
    genesisRejected = true;
  }
  assert(genesisRejected, "signature from another genesis is rejected");

  const tampered = structuredClone(afterPay);
  tampered.blocks[1].transfers[0].currency = "USD";
  assert(validateChain(tampered) !== null, "currency tamper must fail");

  const forged = { ...paid, from: stranger.publicKey };
  let forgedRejected = false;
  try {
    appendTransfer(chain, forged, treasury.publicKey, 3);
  } catch {
    forgedRejected = true;
  }
  assert(forgedRejected, "forged transfer should throw");

  const claim = signBytes(ownershipMessage(chain.networkId, "user-1", "GLANCE-CHART-01"), buyer.privateKey);
  assert(
    verifyBytes(ownershipMessage(chain.networkId, "user-1", "GLANCE-CHART-01"), claim, buyer.publicKey),
    "owner proof"
  );
  assert(ownershipMessage(chain.networkId, "user-1", "GLANCE-CHART-01").startsWith(OWNER_SELECTOR), "owner message starts with selector");

  const otherGenesis = createGenesis(stranger.publicKey, 1, 1);
  assert(selectChain(afterPay, otherGenesis) === afterPay, "different genesis loses");

  const wallet = readFileSync(process.env.ARCHAIOS_WALLET_PATH ?? "/home/user/zhonnex-ecosystem-core/archaios/wallet.html", "utf8");
  assert(wallet.includes(PAYMENT_SELECTOR), "wallet has the payment selector");
  assert(wallet.includes("a9059cbb"), "wallet names the ERC-20 selector");
  assert(wallet.includes("AES-GCM"), "wallet encrypts with AES-GCM");
  assert(wallet.includes("600000"), "wallet uses the same iteration count");

  const passphrase = "correct horse battery";
  const sealed = await sealPrivateKey(buyer.publicKey, buyer.privateKey, passphrase);
  assert(!sealed.includes(buyer.privateKey), "private key is not stored in the clear");
  assert(sealed.startsWith("archaios-key-1"), "key file header");
  const opened = await openPrivateKey(sealed, passphrase);
  assert(opened.publicKey === buyer.publicKey && opened.privateKey === buyer.privateKey, "encrypted key opens");
  let badPass = false;
  try {
    await openPrivateKey(sealed, "wrong horse battery");
  } catch {
    badPass = true;
  }
  assert(badPass, "wrong passphrase is rejected");

  console.log("archaios ok", afterPay.blocks.length, "blocks", PAYMENT_SELECTOR);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});