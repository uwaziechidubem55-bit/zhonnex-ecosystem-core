===========================================================================
FILE: commerce-finance/product-vault/subscriptions.test.ts
===========================================================================
import { PLANS, permits, planById, suggestIdeas, priceReviewHint } from './subscriptions';
function assert(x: boolean, message: string) { if (!x) throw new Error(message); }
assert(PLANS.length === 6 && new Set(PLANS.map(p => p.id)).size === 6, 'six unique plans');
assert(PLANS.every(p => p.currency === 'NGN' && Number.isSafeInteger(p.amountKobo)), 'valid NGN minor amounts');
assert(permits(planById('growth-yearly')!, 'copy') && !permits(planById('starter-monthly')!, 'sharedPlans'), 'tier gates');
assert(!permits(null, 'cloudPlans'), 'no subscription');
assert(suggestIdeas(['Please add team review and reminders']).length === 2, 'ideas are proposals');
assert(priceReviewHint(2).includes('manually'), 'human price approval');
console.log('subscription catalog ok');