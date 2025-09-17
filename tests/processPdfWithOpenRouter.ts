// Process the sample PDF in tests/ using pdfjs text extraction then run OpenRouter chunk processing.
// Run with: npm run demo:openrouter:pdf
// NOTE: This runs in Node, so we need a File polyfill and to load the PDF from disk.

import fs from 'fs';
import path from 'path';
import { processDocumentChunkUnified } from '../services/aiService';
import type { ProcessingMode } from '../types';
import { auditInlineNumericRefs } from '../services/footnoteAudit';
import { auditHeadings } from '../services/headingAudit';

// Lightweight localStorage polyfill (reused pattern)
class MemoryStorage { private m=new Map<string,string>(); getItem(k:string){return this.m.has(k)?this.m.get(k)!:null;} setItem(k:string,v:string){this.m.set(k,String(v));} removeItem(k:string){this.m.delete(k);} }
// @ts-ignore
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = new MemoryStorage();

// pdfjs-dist expects a browser-like global. We'll attempt dynamic import lazily only for text splitting here.
// Instead of reusing extractTextFromFile (browser-oriented), we'll do a simple binary read then treat as single chunk placeholder.
// For a more accurate extraction you'd need pdfjs in Node with proper setup; keeping simple for test harness.

// CONFIG
const PDF_RELATIVE = 'tests/EXMPLE 1p.pdf';
const MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct';
const TASK = process.env.OPENROUTER_TASK || 'Preserve all digits and headings exactly. Do NOT summarize.';

async function loadPdfTextMock(pdfPath: string): Promise<string> {
  // Minimal approach: if real text extraction is required in Node, integrate pdfjs-dist in Node mode.
  // For now, we fallback to a simple tactic: if a .txt with same name exists, use it; else warn.
  const altTxt = pdfPath.replace(/\.pdf$/i, '.txt');
  if (fs.existsSync(altTxt)) {
    return fs.readFileSync(altTxt, 'utf8');
  }
  console.warn('[processPdfWithOpenRouter] Real PDF text extraction not implemented for Node harness. Provide a .txt sidecar to simulate.');
  return 'Sample placeholder text 1. Footnote marker example 2. Heading SECTION TEST. Another line 3.';
}

function chunkText(full: string, targetSize = 1200): string[] {
  if (full.length <= targetSize) return [full];
  const chunks: string[] = [];
  let start = 0;
  while (start < full.length) {
    chunks.push(full.slice(start, start + targetSize));
    start += targetSize;
  }
  return chunks;
}

async function run() {
  const pdfPath = path.resolve(process.cwd(), PDF_RELATIVE);
  if (!fs.existsSync(pdfPath)) {
    console.error('[processPdfWithOpenRouter] PDF not found:', pdfPath);
    process.exit(1);
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[processPdfWithOpenRouter] Missing OPENROUTER_API_KEY env var.');
    process.exit(1);
  }
  localStorage.setItem('openrouter_api_key', apiKey.trim());
  localStorage.setItem('enable_openrouter_numeric_block','1');
  localStorage.setItem('enable_openrouter_retry_numeric','1');
  localStorage.setItem('enable_openrouter_fail_safe','1');
  localStorage.setItem('active_session_id','pdf-session');

  const fullText = await loadPdfTextMock(pdfPath);
  console.log('[PDF] Loaded text length=', fullText.length);
  const chunks = chunkText(fullText, 1200);
  console.log('[PDF] Total chunks=', chunks.length);

  let continuousSummary = '';
  let finalOutput: string[] = [];

  for (let i=0;i<chunks.length;i++) {
    const main = chunks[i];
    const prevOverlap = i>0 ? finalOutput[finalOutput.length-1].split(/\n/).slice(-3).join('\n') : '';
    const nextOverlap = i < chunks.length-1 ? chunks[i+1].split(/\n/).slice(0,3).join('\n') : '';
    const out = await processDocumentChunkUnified({
      main_chunk_content: main,
      continuous_context_summary: continuousSummary,
      previous_chunk_overlap: prevOverlap,
      next_chunk_overlap: nextOverlap,
      task_instructions: TASK,
      onApiCall: () => console.log(`[Chunk ${i+1}/${chunks.length}] API call`),
      mode: 'simple' as ProcessingMode,
      provider: 'openrouter',
      openRouterModel: MODEL,
      expectedSessionId: 'pdf-session'
    });

    const numAudit = auditInlineNumericRefs(main, out);
    const headAudit = auditHeadings(main, out);
    console.log(`\n[Chunk ${i+1}] length in/out = ${main.length}/${out.length}`);
    console.log('[Chunk Audit] numeric lost=', numAudit.lost, 'heading lost=', headAudit.lostHeadings);

    finalOutput.push(out);
  }

  const merged = finalOutput.join('\n');
  console.log('\n[PDF RESULT]\n');
  console.log(merged.slice(0, 4000));
}

run().catch(e => { console.error('Fatal error in PDF harness:', e); process.exit(1); });
