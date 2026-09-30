/** Server-only payment verification for Foundry. Never accept a client-supplied "paid" flag. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifiedPayment = { provider: 'paystack' | 'stripe'; reference: string; amountKobo: number; currency: 'NGN'; email: string; providerTransactionId: string };

function eqHex(received: string | undefined, expected: Buffer): boolean {
  if (!received || !/^[a-f0-9]+$/i.test(received) || received.length !== expected.length * 2) return false;
  return timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
function key(env: string): string {
  const v = process.env[env];
  if (!v) throw new Error(`${env}_REQUIRED`);
  return v;
}
function samePayment(actual: VerifiedPayment, expected: Omit<VerifiedPayment, 'providerTransactionId'>): boolean {
  return actual.provider === expected.provider && actual.reference === expected.reference && actual.amountKobo === expected.amountKobo &&
    actual.currency === expected.currency && actual.email.toLowerCase() === expected.email.toLowerCase();
}

export async function initializePaystack(reference: string, amountKobo: number, email: string): Promise<string> {
  if (!/^fdy_[a-f0-9]{32}$/.test(reference) || !Number.isSafeInteger(amountKobo) || amountKobo < 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_ORDER');
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: {
      Authorization: `Bearer ${key('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json'
    }, body: JSON.stringify({ reference, amount: amountKobo, currency: 'NGN', email })
  });
  if (!response.ok) throw new Error('PAYSTACK_INITIALIZE_FAILED');
  const body = await response.json() as { status?: boolean; data?: { authorization_url?: string; reference?: string } };
  const url = body.data?.authorization_url;
  if (!body.status || body.data?.reference !== reference || !url?.startsWith('https://checkout.paystack.com/')) throw new Error('PAYSTACK_INVALID_RESPONSE');
  return url;
}
export function authenticPaystackWebhook(rawBody: Buffer, signature: string | undefined): boolean {
  if (rawBody.length > 65536) return false;
  return eqHex(signature, createHmac('sha512', key('PAYSTACK_SECRET_KEY')).update(rawBody).digest());
}
export async function verifyPaystack(reference: string, expected: Omit<VerifiedPayment, 'providerTransactionId'>): Promise<VerifiedPayment | null> {
  if (!/^fdy_[a-f0-9]{32}$/.test(reference) || expected.provider !== 'paystack') return null;
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${key('PAYSTACK_SECRET_KEY')}` }
  });
  if (!response.ok) return null;
  const result = await response.json() as { status?: boolean; data?: { status?: string; reference?: string; amount?: number;
    currency?: string; id?: number; customer?: { email?: string } } };
  const d = result.data;
  if (!result.status || d?.status !== 'success' || !Number.isSafeInteger(d.id)) return null;
  const actual: VerifiedPayment = { provider: 'paystack', reference: d.reference || '', amountKobo: d.amount || 0,
    currency: d.currency as 'NGN', email: d.customer?.email || '', providerTransactionId: String(d.id) };
  return samePayment(actual, expected) ? actual : null;
}

/** Stripe remains disabled unless an approved account is configured with server credentials. */
export function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY?.startsWith('sk_') && process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'));
}
export async function initializeStripe(): Promise<never> {
  throw new Error('STRIPE_CHECKOUT_NOT_IMPLEMENTED_DO_NOT_CHARGE');
}