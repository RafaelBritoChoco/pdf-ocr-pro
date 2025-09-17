// Simple validation script to confirm OpenRouter API key works before heavy prompts.
// Run with: npm run validate:openrouter  (after adding script in package.json)
// EXIT CODE: 0 valid, 1 invalid/missing.

import { validateOpenRouterKey } from '../services/openRouterService';

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error('[validateOpenRouterKey] Missing OPENROUTER_API_KEY env var.');
    process.exit(1);
  }
  // Store in localStorage for service usage
  if (typeof localStorage === 'undefined') {
    class MemoryStorage { private m=new Map<string,string>(); getItem(k:string){return this.m.has(k)?this.m.get(k)!:null;} setItem(k:string,v:string){this.m.set(k,String(v));} removeItem(k:string){this.m.delete(k);} }
    // @ts-ignore
    globalThis.localStorage = new MemoryStorage();
  }
  localStorage.setItem('openrouter_api_key', key.trim());
  try {
    const ok = await validateOpenRouterKey();
    if (ok) {
      console.log('[validateOpenRouterKey] SUCCESS: Key accepted by OpenRouter.');
      process.exit(0);
    } else {
      console.error('[validateOpenRouterKey] INVALID: OpenRouter returned 401.');
      process.exit(1);
    }
  } catch (e:any) {
    console.error('[validateOpenRouterKey] ERROR:', e.message || e);
    process.exit(1);
  }
}

main();
