import { FoundryCore } from './index';
function check(condition: boolean, label: string) { if (!condition) throw new Error(label); }
const foundry = new FoundryCore();
const idea = foundry.createIdea('alice', { title: '<Website>', problem: 'Help people find local services', kind: 'website', visibility: 'private' });
check(foundry.getIdea(idea.id, 'bob') === null && foundry.search('services').length === 0, 'private by default search');
let rejected = false;
try { foundry.post(idea.id, 'bob', 'hello'); } catch { rejected = true; }
check(rejected, 'private discussion');
foundry.post(idea.id, 'alice', 'Looking for ideas');
check(foundry.messages(idea.id, 'alice').length === 1, 'owner discussion');
const output = foundry.generateWebsitePrototype(idea.id, 'alice');
check(output.html.includes('&lt;Website&gt;') && !output.html.includes('<Website>') && output.sha256.length === 64, 'safe prototype');
foundry.registerBuilder('bob', 'Builder Bob', ['HTML']);
check(foundry.listBuilders().length === 0, 'pending hidden');
foundry.verifyBuilder('bob', 'trusted-admin');
check(foundry.listBuilders().length === 1, 'verified visible');
const q = foundry.draftQuote(idea.id, 'alice', 40, 300000, 100000);
check(q.buildCostKobo === 12000000 && q.futureValueRangeKobo[0] === 0, 'scenario math');
check(!foundry.canContactBuilders(idea.id, 'alice'), 'no free contacts');
foundry.acceptQuote(idea.id, 'alice');
rejected = false;
try { foundry.recordBuilderAccessPayment({ ideaId: idea.id, buyerId: 'alice', reference: 'fake', amountKobo: 1, currency: 'NGN', provider: 'paystack', verifiedByServer: true }); } catch { rejected = true; }
check(rejected && !foundry.canContactBuilders(idea.id, 'alice'), 'wrong payment denied');
foundry.recordBuilderAccessPayment({ ideaId: idea.id, buyerId: 'alice', reference: 'verified-1', amountKobo: 100000, currency: 'NGN', provider: 'paystack', verifiedByServer: true });
check(foundry.canContactBuilders(idea.id, 'alice') && !foundry.canContactBuilders(idea.id, 'bob'), 'project-scoped paid access');
console.log('foundry core ok');