      signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${secret()}` }
    });
    if (!response.ok) return false;
    const result = await response.json() as { status?: boolean; data?: {
      status?: string; reference?: string; amount?: number; currency?: string; customer?: { email?: string };
    } };
    const data = result.data;
    if (!result.status || data?.status !== 'success' || data.reference !== order.reference ||
        data.amount !== order.amount || data.currency !== order.currency ||
        data.customer?.email?.toLowerCase() !== order.email.toLowerCase()) return false;
    order.status = 'paid'; order.paidAt = Date.now();
    writeOrders(orders);
    return true;
  });
}

/** Must be called after your server has authenticated the buyer. */
export async function hasPaidEntitlement(buyerId: string, productId: string): Promise<boolean> {
  return transaction(() => readOrders().some(o => o.status === 'paid' && o.buyerId === buyerId && o.productId === productId));
}

/** Stripe remains deliberately off until a legitimate Stripe merchant account is approved. */
export function startStripeCheckout(): never {
  throw new Error('STRIPE_NOT_CONFIGURED_OR_APPROVED');
}
