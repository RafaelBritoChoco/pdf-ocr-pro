// Simple Node demo to call the Docling FastAPI service using fetch and form-data
// Run: npm run demo:docling -- DOC=tests/EXMPLE 1p.pdf MODE=advanced ENDPOINT=http://127.0.0.1:8008

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const doc = process.env.DOC || 'tests/EXMPLE 1p.pdf';
  const mode = (process.env.MODE || 'simple') as 'simple'|'advanced';
  const endpoint = (process.env.ENDPOINT || 'http://127.0.0.1:8008').replace(/\/$/, '');
  const abs = path.resolve(process.cwd(), doc);
  if (!fs.existsSync(abs)) {
    console.error('[doclingDemo] File not found:', abs);
    process.exit(1);
  }
  const buf = fs.readFileSync(abs);
  const form = new FormData();
  form.append('file', new Blob([buf]), path.basename(abs));
  const url = `${endpoint}/extract?mode=${encodeURIComponent(mode)}`;
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    console.error('[doclingDemo] HTTP', res.status, await res.text());
    process.exit(2);
  }
  const js: any = await res.json();
  console.log('[doclingDemo] meta=', js?.meta);
  console.log('\n--- TEXT (first 2000 chars) ---\n');
  console.log(String(js?.text || '').slice(0, 2000));
}

main().catch(e => { console.error('doclingDemo failed', e); process.exit(1); });
