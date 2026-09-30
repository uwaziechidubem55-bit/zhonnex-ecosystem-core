===========================================================================
FILE: commerce-finance/product-vault/subscriptions.ts
===========================================================================
/** LaunchSprint subscription catalog. Server-owned prices; never trust browser prices. */
export type Tier = 'starter' | 'growth' | 'team';
export type Billing = 'monthly' | 'yearly';
export type Feature = 'roadmap' | 'offer' | 'pricing' | 'copy' | 'review' | 'cloudPlans' | 'sharedPlans' | 'memberAccess';
export type Plan = Readonly<{ id: string; tier: Tier; billing: Billing; amountKobo: number; currency: 'NGN'; features: readonly Feature[] }>;
const starter: readonly Feature[] = ['roadmap', 'offer', 'pricing'];
const growth: readonly Feature[] = [...starter, 'copy', 'review', 'cloudPlans'];
const team: readonly Feature[] = [...growth, 'sharedPlans', 'memberAccess'];
export const PLANS: readonly Plan[] = Object.freeze([
  { id: 'starter-monthly', tier: 'starter', billing: 'monthly', amountKobo: 150000, currency: 'NGN', features: starter },
  { id: 'starter-yearly', tier: 'starter', billing: 'yearly', amountKobo: 1200000, currency: 'NGN', features: starter },
  { id: 'growth-monthly', tier: 'growth', billing: 'monthly', amountKobo: 350000, currency: 'NGN', features: growth },
  { id: 'growth-yearly', tier: 'growth', billing: 'yearly', amountKobo: 3000000, currency: 'NGN', features: growth },
  { id: 'team-monthly', tier: 'team', billing: 'monthly', amountKobo: 800000, currency: 'NGN', features: team },
  { id: 'team-yearly', tier: 'team', billing: 'yearly', amountKobo: 7200000, currency: 'NGN', features: team }
]);
export function planById(id: string): Plan | undefined { return PLANS.find(p => p.id === id); }
export function permits(plan: Plan | null, feature: Feature): boolean { return !!plan?.features.includes(feature); }

export type FeatureIdea = { id: string; title: string; evidence: string; proposedTier: Tier; impact: 'low' | 'medium' | 'high'; status: 'proposed' | 'approved' | 'rejected' };
/** Suggestions, not autonomous releases or pricing decisions. Owner reviews evidence and edits approved manifest. */
export function suggestIdeas(feedback: readonly string[]): FeatureIdea[] {
  const corpus = feedback.filter(s => s.length <= 1000).join(' ').toLowerCase();
  const candidates: Array<[string, string, Tier, string]> = [
    ['reminders', 'Optional milestone reminders', 'growth', 'remind'],
    ['exports', 'More export formats', 'growth', 'export'],
    ['collaboration', 'Shared team review', 'team', 'team'],
    ['languages', 'Additional language packs', 'growth', 'language']
  ];
  return candidates.filter(([, , , keyword]) => corpus.includes(keyword)).map(([id, title, proposedTier, keyword]) => ({
    id, title, proposedTier, evidence: `Feedback mentions "${keyword}"; confirm demand with customers before release.`, impact: 'medium', status: 'proposed'
  }));
}
/** Internal planning aid only; NEVER automatically alters a customer charge or Paystack plan. */
export function priceReviewHint(approvedNewFeatures: number): string {
  if (!Number.isSafeInteger(approvedNewFeatures) || approvedNewFeatures < 0) throw new Error('INVALID_FEATURE_COUNT');
  return approvedNewFeatures === 0 ? 'No price review needed.' :
    `Review pricing manually after ${approvedNewFeatures} approved feature(s). Existing subscribers keep their agreed billing until notified and lawfully migrated.`;
}