import { generateWebsite } from './ai-builder';
function ok(x: boolean, name: string) { if (!x) throw new Error(name); }
async function run() {
  process.env.FOUNDRY_AI_BASE_URL = 'https://ai.example.test';
  process.env.FOUNDRY_AI_ALLOWED_HOSTS = 'ai.example.test';
  process.env.FOUNDRY_AI_MODEL = 'example-model';
  process.env.FOUNDRY_AI_API_KEY = 'not-a-real-key';
  let html = '<!doctype html><html><body>Example</body></html>';
  globalThis.fetch = async (_url, init) => {
    ok(String(init?.headers && (init.headers as Record<string, string>).Authorization).startsWith('Bearer '), 'server key');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ files: [{ path: 'index.html', content: html }], notes: ['Review this draft.'] }) } }] }));
  };
  const brief = { kind: 'website' as const, title: 'Example', problem: 'Explain a useful product', requirements: ['Accessible heading'] };
  const result = await generateWebsite(brief);
  ok(result.status === 'review-required' && result.files[0].sha256.length === 64, 'reviewable output');
  html = '<!doctype html><html><script>alert(1)</script></html>';
  let rejected = false; try { await generateWebsite(brief); } catch { rejected = true; }
  ok(rejected, 'script rejected');
  rejected = false; try { await generateWebsite({ ...brief, kind: 'mobile-app' }); } catch { rejected = true; }
  ok(rejected, 'unsupported product rejected');
  console.log('foundry ai builder ok');
}
run().catch(e => { console.error(e); process.exitCode = 1; });