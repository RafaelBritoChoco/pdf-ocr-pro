<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PDF OCR 2.4 – Extração + Estruturação Inteligente

Pipeline local de extração de texto de PDFs com opção de OCR resiliente e múltiplas etapas de estruturação assistida por IA (limpeza, detecção de títulos, notas de rodapé e marcação de conteúdo). Prioriza privacidade: o PDF bruto não sai do seu ambiente; somente trechos de texto são enviados ao provedor de IA escolhido.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copie `.env.example` para `.env.local` e preencha as chaves (NÃO comite `.env.local`):
   - `GEMINI_API_KEY=...`
   - (Opcional) `OPENROUTER_API_KEY=...`
   - (Opcional) Model overrides: `GEMINI_MODEL=` / `OPENROUTER_MODEL=`
3. Execute localmente:
   `npm run dev`

### Variáveis de Ambiente

Arquivo exemplo: `.env.example`.

O arquivo real `.env.local` está no `.gitignore` para evitar vazamento de credenciais. Nunca coloque chaves em commits, issues ou screenshots.

### Fornecedores de IA

Por padrão o app usa Gemini. OpenRouter reutiliza as mesmas instruções-base e aplica ajustes para consistência.

### Segurança

Se uma chave for exposta, gere uma nova imediatamente e remova a antiga. Utilize permissões mínimas necessárias.

### Scanner de Segredos

Execute antes de commitar para garantir que nenhuma chave vazou:

```bash
npm run scan:secrets
```

Saída com código diferente de 0 indica possíveis padrões suspeitos. Revise antes do commit.

### Hook Pré-Commit (Opcional)

Opção 1 (simples) – crie `.git/hooks/pre-commit` (sem extensão) com:

```bash
#!/bin/sh
node scripts/secret-scan.js || {
   echo "\n[pre-commit] Bloqueado por possíveis segredos."; exit 1;
}
```

Depois dê permissão de execução (Linux/macOS): `chmod +x .git/hooks/pre-commit`.

No Windows (Git Bash) funciona igual; em PowerShell pode usar Git Bash para instalar.

Opção 2 (com bloqueio de PDFs grandes) – copie `scripts/pre-commit.sample` para `.git/hooks/pre-commit` e torne executável.

Para ajustar limite de tamanho escaneado ou ignorar arquivos grandes no secret-scan:

```bash
SCAN_MAX_SIZE=300000 npm run scan:secrets
```

### Limpeza / Repositório Enxuto

Diretórios gerados automaticamente não são versionados (`node_modules/`, `dist/`, `coverage/`, etc.). PDFs de teste locais devem ficar em `samples-local/` (ignorados por padrão).

### Estrutura mínima recomendada

```
App.tsx
components/
services/
hooks/
types.ts
package.json
package-lock.json
tsconfig.json
vite.config.ts
README.md
CHANGELOG.md
LICENSE
.gitignore
.gitattributes
scripts/secret-scan.js
scripts/pre-commit.sample
.env.example
```

### Licença

MIT. Veja `LICENSE`.
