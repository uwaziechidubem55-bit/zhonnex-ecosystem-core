===========================================================================
FILE: commerce-finance/product-vault/payments.test.ts
===========================================================================
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuredProducts, hasPaidEntitlement, processPaystackWebhook, startPaystackCheckout, startStripeCheckout } from './payments';

function assert(value: boolean, label: string) { if (!value) throw new Error(label); }
async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'zhv-test-'));
  try {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake_not_a_real_key';
    process.env.ZHONNEX_ORDERS_PATH = join(dir, 'orders.json');
    process.env.ZHONNEX_VAULT_PRODUCTS_JSON = JSON.stringify([{ id: 'demo', name: 'Demo', amount: 150050, currency: 'NGN', storagePath: 'private/demo.bin' }]);
    assert(configuredProducts().length === 1, 'product configuration');
    let reference = '';
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/initialize')) {
        const body = JSON.parse(String(init?.body));
        assert(body.amount === 150050 && body.currency === 'NGN', 'server sets price');
        reference = body.reference;
        return new Response(JSON.stringify({ status: true, data: { reference, authorization_url: 'https://checkout.paystack.com/test' } }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: true, data: {
        status: 'success', reference, amount: 150050, currency: 'NGN', customer: { email: 'buyer@example.com' }
      } }), { status: 200 });
    };
    const started = await startPaystackCheckout('buyer-1', 'buyer@example.com', 'demo');
    assert(Boolean(started.orderId) && !await hasPaidEntitlement('buyer-1', 'demo'), 'checkout is not payment');
    const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference } }));
    assert(!await processPaystackWebhook(body, '0'.repeat(128)), 'bad signature denied');
    assert(!await hasPaidEntitlement('buyer-1', 'demo'), 'bad signature cannot grant');
    const sig = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
    assert(await processPaystackWebhook(body, sig), 'valid webhook and provider verification');
    assert(await processPaystackWebhook(body, sig), 'duplicate webhook idempotent');
    assert(await hasPaidEntitlement('buyer-1', 'demo') && !await hasPaidEntitlement('buyer-2', 'demo'), 'buyer-scoped entitlement');
    let stripeOff = false;
    try { startStripeCheckout(); } catch { stripeOff = true; }
    assert(stripeOff, 'Stripe disabled');
    console.log('vault payments ok');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

