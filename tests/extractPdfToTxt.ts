// Node PDF text extractor using pdfjs-dist to produce a .txt sidecar for a PDF.
// Run: npm run extract:pdf -- PDF_PATH="tests/EXMPLE 1p.pdf"

import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
// In Node (ESM) we typically don't need an external worker; pdfjs can operate in pure JS mode for text.
// If needed, could set: pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.mjs', import.meta.url);

async function extract(pdfPath: string) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  let out: string[] = [];
  for (let pageNum=1; pageNum<=pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const txt = await page.getTextContent();
    const line = txt.items.map((it:any)=> 'str' in it ? it.str : '').join(' ');
    out.push(line.trim());
  }
  return out.join('\n\n').trim();
}

async function main() {
  const rel = process.env.PDF_PATH || 'tests/EXMPLE 1p.pdf';
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) { console.error('[extractPdfToTxt] File not found:', abs); process.exit(1); }
  const text = await extract(abs);
  const outPath = abs.replace(/\.pdf$/i, '.txt');
  fs.writeFileSync(outPath, text, 'utf8');
  console.log('[extractPdfToTxt] Wrote', outPath, 'chars=', text.length);
}

main().catch(e => { console.error('Extraction failed', e); process.exit(1); });
