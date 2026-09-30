import { createHmac } from 'node:crypto';
import { authenticPaystackWebhook, initializePaystack, initializeStripe, stripeConfigured, verifyPaystack } from './provider-payments';
function ok(value: boolean, message: string) { if (!value) throw new Error(message); }
async function run() {
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake';
  delete process.env.STRIPE_SECRET_KEY;
  ok(!stripeConfigured(), 'stripe closed without keys');
  let rejected = false; try { await initializeStripe(); } catch { rejected = true; }
  ok(rejected, 'stripe cannot accept money');
  const ref = 'fdy_' + 'a'.repeat(32), raw = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
  ok(authenticPaystackWebhook(raw, signature) && !authenticPaystackWebhook(raw, '0'.repeat(128)), 'signed raw bytes');
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('initialize')) {
      const payload = JSON.parse(String(init?.body));
      ok(payload.amount === 150000 && payload.currency === 'NGN', 'server amount');
      return new Response(JSON.stringify({ status: true, data: { reference: ref, authorization_url: 'https://checkout.paystack.com/test' } }));
    }
    return new Response(JSON.stringify({ status: true, data: { status: 'success', reference: ref, amount: 150000, currency: 'NGN', id: 555, customer: { email: 'buyer@example.com' } } }));
  };
  ok((await initializePaystack(ref, 150000, 'buyer@example.com')).startsWith('https://checkout.paystack.com/'), 'checkout');
  const expected = { provider: 'paystack' as const, reference: ref, amountKobo: 150000, currency: 'NGN' as const, email: 'buyer@example.com' };
  ok((await verifyPaystack(ref, expected))?.providerTransactionId === '555', 'verified matching transaction');
  ok(await verifyPaystack(ref, { ...expected, amountKobo: 150001 }) === null, 'wrong amount rejected');
  console.log('foundry provider payments ok');
}
run().catch(e => { console.error(e); process.exitCode = 1; });