/** Zhonnex Foundry — ninth-software domain core. No network, shell, payments or deployment in this module. */
import { randomUUID, createHash } from 'node:crypto';

export type DigitalKind = 'website' | 'web-app' | 'mobile-app' | 'desktop-app' | 'digital-product' | 'other';
export type Idea = { id: string; ownerId: string; title: string; problem: string; kind: DigitalKind; visibility: 'private' | 'public'; createdAt: number };
export type Discussion = { id: string; ideaId: string; authorId: string; text: string; createdAt: number };
export type Builder = { id: string; displayName: string; skills: string[]; verification: 'pending' | 'verified' | 'suspended'; verifiedBy?: string };
export type Quote = { ideaId: string; currency: 'NGN'; buildCostKobo: number; accessFeeKobo: number; futureValueRangeKobo: [number, number]; assumptions: string[]; acceptedAt?: number };
export type Receipt = { ideaId: string; buyerId: string; reference: string; amountKobo: number; currency: 'NGN'; provider: 'paystack'; verifiedByServer: true };

const kinds: DigitalKind[] = ['website', 'web-app', 'mobile-app', 'desktop-app', 'digital-product', 'other'];
function text(input: string, max: number): string {
  if (typeof input !== 'string' || !input.trim() || input.length > max) throw new Error('FOUNDRY_INVALID_TEXT');
  return input.trim();
}
function escapeHtml(input: string): string { return input.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }

/** Caller must authenticate actor IDs. State must be saved in a transactional database by an API layer. */
export class FoundryCore {
  private ideas = new Map<string, Idea>();
  private discussions = new Map<string, Discussion[]>();
  private builders = new Map<string, Builder>();
  private receipts = new Map<string, Receipt>();
  private quotes = new Map<string, Quote>();

  createIdea(ownerId: string, input: Pick<Idea, 'title' | 'problem' | 'kind' | 'visibility'>): Idea {
    text(ownerId, 128);
    if (!kinds.includes(input.kind) || !['private', 'public'].includes(input.visibility)) throw new Error('FOUNDRY_INVALID_IDEA');
    const idea: Idea = { id: randomUUID(), ownerId, title: text(input.title, 120), problem: text(input.problem, 4000), kind: input.kind, visibility: input.visibility, createdAt: Date.now() };
    this.ideas.set(idea.id, idea); return { ...idea };
  }
  getIdea(id: string, actorId?: string): Idea | null {
    const idea = this.ideas.get(id);
    return idea && (idea.visibility === 'public' || idea.ownerId === actorId) ? { ...idea } : null;
  }
  search(query: string): Idea[] {
    const q = text(query, 100).toLowerCase();
    return [...this.ideas.values()].filter(i => i.visibility === 'public' && `${i.title} ${i.problem}`.toLowerCase().includes(q)).slice(0, 50).map(i => ({ ...i }));
  }
  post(ideaId: string, authorId: string, message: string): Discussion {
    if (!this.getIdea(ideaId, authorId)) throw new Error('FOUNDRY_NOT_FOUND');
    const item: Discussion = { id: randomUUID(), ideaId, authorId: text(authorId, 128), text: text(message, 2000), createdAt: Date.now() };
    this.discussions.set(ideaId, [...(this.discussions.get(ideaId) ?? []), item]); return { ...item };
  }
  messages(ideaId: string, actorId?: string): Discussion[] {
    if (!this.getIdea(ideaId, actorId)) throw new Error('FOUNDRY_NOT_FOUND');
    return (this.discussions.get(ideaId) ?? []).map(m => ({ ...m }));
  }
  registerBuilder(id: string, displayName: string, skills: string[]): Builder {
    if (!Array.isArray(skills) || skills.length < 1 || skills.length > 12) throw new Error('FOUNDRY_INVALID_SKILLS');
    const builder: Builder = { id: text(id, 128), displayName: text(displayName, 100), skills: skills.map(s => text(s, 50)), verification: 'pending' };
    if (this.builders.has(id)) throw new Error('FOUNDRY_DUPLICATE_BUILDER');
    this.builders.set(id, builder); return { ...builder, skills: [...builder.skills] };
  }
  /** ADMIN ONLY: authenticate and authorize admin in the API layer before calling. */
  verifyBuilder(builderId: string, adminId: string): void {
    const builder = this.builders.get(builderId);
    if (!builder) throw new Error('FOUNDRY_NOT_FOUND');
    builder.verification = 'verified'; builder.verifiedBy = text(adminId, 128);
  }
  // This public listing contains no direct contact information. No invented builder profiles.
  listBuilders(): Builder[] { return [...this.builders.values()].filter(b => b.verification === 'verified').map(b => ({ ...b, skills: [...b.skills] })); }

  /** Estimates are illustrative scenarios, NOT predictions of future revenue or automatically binding prices. */
  draftQuote(ideaId: string, ownerId: string, estimatedHours: number, hourlyRateKobo: number, accessFeeKobo: number): Quote {
    const idea = this.ideas.get(ideaId);
    if (!idea || idea.ownerId !== ownerId) throw new Error('FOUNDRY_NOT_OWNER');
    if (!Number.isSafeInteger(estimatedHours) || estimatedHours < 1 || estimatedHours > 2000 ||
        !Number.isSafeInteger(hourlyRateKobo) || hourlyRateKobo < 1 || hourlyRateKobo > 10000000 ||
        !Number.isSafeInteger(accessFeeKobo) || accessFeeKobo < 0 || accessFeeKobo > 100000000) throw new Error('FOUNDRY_INVALID_QUOTE');
    const buildCostKobo = estimatedHours * hourlyRateKobo;
    if (!Number.isSafeInteger(buildCostKobo)) throw new Error('FOUNDRY_INVALID_QUOTE');
    const quote: Quote = { ideaId, currency: 'NGN', buildCostKobo, accessFeeKobo,
      futureValueRangeKobo: [0, buildCostKobo * 2],
      assumptions: [`${estimatedHours} estimated hours at ${hourlyRateKobo} kobo/hour`, 'Future value is unknown; range is a scenario, not a forecast or guaranteed return.', 'Final build price requires buyer and builder agreement.'] };
    this.quotes.set(ideaId, quote); return { ...quote, assumptions: [...quote.assumptions], futureValueRangeKobo: [...quote.futureValueRangeKobo] as [number, number] };
  }
  acceptQuote(ideaId: string, ownerId: string): void {
    if (this.ideas.get(ideaId)?.ownerId !== ownerId || !this.quotes.has(ideaId)) throw new Error('FOUNDRY_NOT_OWNER');
    this.quotes.get(ideaId)!.acceptedAt = Date.now();
  }
  /** TRUSTED WEBHOOK HANDLER ONLY: pass a server-verified receipt, never browser JSON. */
  recordBuilderAccessPayment(receipt: Receipt): void {
    const quote = this.quotes.get(receipt.ideaId);
    if (!receipt.verifiedByServer || receipt.provider !== 'paystack' || receipt.currency !== 'NGN' ||
        !receipt.reference || !quote?.acceptedAt || receipt.amountKobo !== quote.accessFeeKobo ||
        this.ideas.get(receipt.ideaId)?.ownerId !== receipt.buyerId || this.receipts.has(receipt.reference)) throw new Error('FOUNDRY_PAYMENT_REJECTED');
    this.receipts.set(receipt.reference, { ...receipt });
  }
  canContactBuilders(ideaId: string, ownerId: string): boolean {
    return this.ideas.get(ideaId)?.ownerId === ownerId && [...this.receipts.values()].some(r => r.ideaId === ideaId && r.buyerId === ownerId);
  }
  /** Narrow, safe starter output. It DOES NOT generate arbitrary apps or execute code. */
  generateWebsitePrototype(ideaId: string, ownerId: string): { filename: string; html: string; sha256: string } {
    const idea = this.ideas.get(ideaId);
    if (!idea || idea.ownerId !== ownerId) throw new Error('FOUNDRY_NOT_OWNER');
    if (idea.kind !== 'website') throw new Error('FOUNDRY_GENERATOR_NOT_SUPPORTED');
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(idea.title)}</title><main style="max-width:720px;margin:5rem auto;font:18px system-ui;line-height:1.6;padding:1rem"><h1>${escapeHtml(idea.title)}</h1><p>${escapeHtml(idea.problem)}</p><p>Prototype only — replace this with a tested product and real contact information before launch.</p></main></html>`;
    return { filename: 'index.html', html, sha256: createHash('sha256').update(html).digest('hex') };
  }
}