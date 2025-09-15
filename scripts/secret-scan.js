#!/usr/bin/env node
/**
 * Simple secret scanner (lightweight, no deps) to catch obvious API key leaks before commit.
 */
const { readFileSync, readdirSync, statSync } = require('fs');
const { join, extname } = require('path');

const ROOT = process.cwd();
const EXTS_SKIP = new Set(['.png','.jpg','.jpeg','.pdf','.lock']);
const DIRS_SKIP = new Set(['.git','node_modules','dist']);

// Common patterns (broad but useful)
const PATTERNS = [
  [/AIza[0-9A-Za-z\-_]{35}/g, 'Possible Google API Key'],
  [/ghp_[0-9A-Za-z]{36}/g, 'GitHub Personal Access Token'],
  [/sk-[a-zA-Z0-9-_]{20,}/g, 'Secret style key (sk-*)'],
  [/OPENROUTER(_|)API(_|)KEY/i, 'Literal OPENROUTER API KEY reference'],
  [/GEMINI(_|)API(_|)KEY/i, 'Literal GEMINI API KEY reference with value'],
  [/-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/i, 'Private Key Block'],
];

let issues = [];
let oversize = [];

// Optional size limit (bytes) via env: SCAN_MAX_SIZE=200000 or default 500k
const MAX_SIZE = parseInt(process.env.SCAN_MAX_SIZE || '512000', 10);

function scanFile(p){
  let content;
  try { content = readFileSync(p,'utf8'); } catch { return; }
  PATTERNS.forEach(([regex, label]) => {
    let match;
    while((match = regex.exec(content))){
      const snippet = match[0].slice(0,60);
      issues.push({ file: p.replace(ROOT+'\\',''), label, snippet });
    }
  });
}

function walk(dir){
  const entries = readdirSync(dir);
  for(const e of entries){
    const full = join(dir,e);
    const rel = full.replace(ROOT+'\\','');
    if(DIRS_SKIP.has(e)) continue;
    try {
      const st = statSync(full);
      if(st.isDirectory()) { walk(full); continue; }
      const ext = extname(e).toLowerCase();
      if(EXTS_SKIP.has(ext)) continue;
      if(ext === '.env' || e.startsWith('.env')) continue; // env files ignored
      if(st.size > MAX_SIZE) {
        oversize.push({ file: rel, size: st.size });
        continue; // skip scanning huge files
      }
      scanFile(full);
    } catch { /* ignore */ }
  }
}

walk(ROOT);

if(oversize.length){
  console.warn(`\n[SECRET-SCAN] Arquivos grandes ignorados (> ${MAX_SIZE} bytes):`);
  oversize.forEach(o => console.warn(`- ${o.file} (${o.size} bytes)`));
}

if(issues.length){
  console.error('\n[SECRET-SCAN] POSSÍVEIS VAZAMENTOS ENCONTRADOS:');
  issues.forEach(i => {
    console.error(`- ${i.file} :: ${i.label} :: ${i.snippet}`);
  });
  console.error('\nReveja os arquivos antes de commitar.');
  process.exitCode = 2;
} else {
  console.log('[SECRET-SCAN] Nenhum padrão suspeito encontrado.');
}
