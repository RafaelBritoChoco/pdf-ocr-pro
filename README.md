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

Itens que não devem ir para o Git (resumo):
- `node_modules/`, `dist/`, caches de ferramentas (`.cache/`, `coverage/`, `__pycache__/`, `.pytest_cache/`)
- Arquivos de ambiente: `.env`, `.env.local` (use `.env.example` como referência)
- Arquivos grandes locais de teste: `samples-local/`, `tests-local/`
- Backups temporários: `*.bak`, `*.orig`, `*.rej`, `*.diff`

Dica: rode `npm run scan:secrets` antes de commitar para evitar vazamentos.

### Estrutura mínima recomendada

```
App.tsx
components/
services/
hooks/
types.ts
package.json
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


## 🔧 Recursos Adicionais (v2.4 OpenRouter Enhancements)

### Enforcement Inteligente de Tags
Para o provider OpenRouter, cada chunk passa por uma verificação automática que detecta ausência de tags esperadas:
- Headlines: `{{levelX}}...{{-levelX}}`
- Footnotes: `{{footnotenumberN}}` e `{{footnoteN}}`
- Conteúdo: bloco `{{text_level}} ... {{-text_level}}` com níveis internos

Se padrões fortes (ex: "CHAPTER", "Article 5", "Art. 3") são detectados no texto original mas as tags não aparecem, uma chamada de reforço é disparada com instrução crítica. A saída só é substituída se as tags forem realmente adicionadas.

### Telemetria Local (Somente Browser)
Nenhum dado sai da sua máquina. Chaves usadas:
- `openrouter_tag_enforcement_events`: histórico (últimos 200) de eventos de reforço.
- `tag_integrity_history`: snapshots agregados pós-etapa (headlines, footnotes, content) com contagens.

Inspecione rapidamente no console:
```js
JSON.parse(localStorage.getItem('tag_integrity_history')||'[]').slice(-2)
```

### Flags Avançadas (localStorage)
| Chave | Valor | Descrição |
|-------|-------|-----------|
| `openrouter_strategy` | `clone` / `adapted` | Prompt completo estilo Gemini ou versão enxuta (default `adapted`). |
| `openrouter_disable_preclean` | `1` | Desativa pré-limpeza global mesmo que UI esteja ligada. |
| `preclean_enabled` | `true/false` | Controle persistente da UI de pré-limpeza. |
| `openrouter_enforcement` | `0` | Desliga enforcement inteligente (não recomendado). |
| `openrouter_model` | `<model id>` | Define modelo (ex: `qwen/qwen-2.5-7b-instruct`). |
| `openrouter_parity` | `1` | (Experimental) Reativa heurísticas antigas de paridade de formatação. |

Exemplo para desabilitar enforcement (teste):
```js
localStorage.setItem('openrouter_enforcement','0')
```

### Serviço `tagIntegrityService`
Arquivo: `services/tagIntegrityService.ts`.
Funções principais:
```ts
analyzeHeadlines(text)
analyzeFootnotes(text)
analyzeContent(text)
recordIntegrity(summary)
```
São chamadas automaticamente em `App.tsx` após cada etapa para armazenar snapshots.

### Boas Práticas de Modelos OpenRouter
- Prefira modelos com instrução clara (ex: Qwen Instruct, Llama Instruct) para tagging determinístico.
- Temperatura baixa (0.1–0.2) reduz risco de omissão de tags.
- Use chunk count que mantenha cada pedaço < 8k tokens para minimizar truncamento.

### Licença

MIT. Veja `LICENSE`.

---

## 🔄 Modo Clone Total (Paridade Gemini)

Desde a revisão de setembro/2025, o fluxo OpenRouter pode operar em modo **clone total**:

Características:
- Mesmo MASTER PROMPT do Gemini (arquivo fonte único: `services/masterPrompt.ts`).
- Temperatura fixa em `0.1` (sem variação por modo FAST/NORMAL para preservar estabilidade).
- Sem pré-limpeza, enforcement, auditorias, sanitização ou heurísticas adicionais: primeira resposta é usada diretamente.
- Risco reduzido de duplicações ou truncamentos induzidos por múltiplos passes.

Arquivos relevantes:
- `services/masterPrompt.ts` – construtor único do prompt.
- `services/aiService.ts` – usa `buildMasterPrompt` para Gemini e OpenRouter (quando provider = openrouter).

Removido neste modo (antes existiam e podem ser reintroduzidos se necessário):
- Estratégias (`adapted`, `robust`).
- Pré-limpeza LLM e local.
- Enforcement de tags / reforço de footnotes.
- Sanitização pós-modelo.
- Auditorias de prefixos numéricos e snapshots de classificação.

Reversão (caso queira restaurar camadas antigas):
1. Recuperar histórico do commit anterior à simplificação.
2. Repor funções removidas em `aiService.ts` (preclean, enforcement, sanitizer, etc.).
3. Manter `masterPrompt.ts` para garantir alinhamento futuro e reduzir drift.

Script de verificação manual de paridade de prompt:
```
node tests/promptParityCheck.ts  (se adicionar suporte a execução TS ou transpilar antes)
```
Saída esperada:
```
[PARITY OK] Prompts are identical in this sample. Length: ...
```

Motivação da mudança:
> Simplificar e eliminar fontes secundárias de erro após constatação de que camadas de defesa estavam introduzindo duplicações e divergências de formatação que o prompt base do Gemini já evitava por design.

---


Foi adicionada uma pipeline Python separada para revisão final de tags jurídicas (inspirada na descrição do revisor Gemini Fast). Ela pode operar isoladamente em textos já extraídos.

### Instalação (opcional para modo Python)

```
pip install -r requirements.txt
# PowerShell
$Env:GEMINI_API_KEY="SUA_KEY"
```

### Uso Rápido

```python
from legal_tag_pipeline import quick_process

texto = "Art 1 Texto sem formatação correta\n§ 1º Parágrafo isolado"
resultado = quick_process(texto, api_key="SUA_KEY")

print("Status:", resultado.validation_result.status)
print("Erros:", resultado.review_result.error_count)
print(resultado.final_content[:400])
```

### CLI

```
python -m legal_tag_pipeline.main entrada.txt -o saida.txt --api-key SUA_KEY
python -m legal_tag_pipeline.main pasta_entrada -o pasta_saida --batch --pattern "*.txt"
python -m legal_tag_pipeline.main doc.txt -o doc_corrigido.txt --strict
```

### Estrutura

```
legal_tag_pipeline/
   models.py              # Dataclasses e enums
   tag_reviewer.py        # Heurísticas de detecção
   llm_client.py          # Gemini + fake
   llm_corrector.py       # Correção focada
   final_validator.py     # Score e status
   gemini_fast_processor.py  # Orquestração
   main.py                # CLI
```

### Notas
- Sem GEMINI_API_KEY o comportamento é somente revisão heurística (sem correção automática).
- Ajuste iterações: `--iterations 5` (default 3).
- `--strict` impede aceitar status WARNING.

### Extração com Docling (OpenRouter)

Opcionalmente, quando o provedor ativo for OpenRouter, a extração inicial pode usar a biblioteca Docling via um microserviço Python local.

1) Instale dependências Python (em venv recomendado):

   - Arquivo `requirements.txt` já inclui:
     - `docling`, `fastapi`, `uvicorn`

2) Execute o serviço local:

   - Windows PowerShell:
     - Ative seu ambiente (se aplicável) e rode:
       `python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008 --reload`

3) No app, com provedor OpenRouter selecionado:

   - Modo Simples (FAST) -> Docling `simple` (sem OCR, rápido, PDFs machine-readable)
   - Modo Avançado (QUALITY) -> Docling `advanced` (com OCR e estrutura de tabelas)

Para o provedor OpenRouter, Docling é obrigatório para a extração inicial; se o serviço não estiver disponível, o processamento não iniciará até o serviço ficar online.

Para customizar o endpoint do serviço Docling, defina em localStorage: `docling_endpoint` (ex.: `http://localhost:8008`).

### Teste rápido

```
pytest -k smoke -q
```

---

## ⚡️ Início Rápido (Windows) – Docling + Front

Pré‑requisitos: Python 3.10+, Node.js 18+, PowerShell.

1) Rodar tudo automaticamente (recomendado no Windows):

   - Clique duas vezes em `scripts/start-all.bat`, ou rode no terminal:

   ```bat
   scripts\start-all.bat
   ```

   Alternativa (via npm):

   ```bat
   npm run start:all
   ```

   O script irá:
   - Criar um venv externo em `C:\docling-venv` (caso não exista) e instalar dependências Python.
   - Subir o serviço Docling em `http://127.0.0.1:8008` (detached) e criar logs em `scripts/logs`.
   - Iniciar o Vite dev server e abrir o app em `http://localhost:5173/`.

2) Verificar saúde do Docling:

   - Abra no navegador: `http://127.0.0.1:8008/health` → deve retornar `{ "status": "ok" }`.

3) Definir endpoint na UI (se necessário):

   - No navegador, abra DevTools (F12) → Console e execute:
   ```js
   localStorage.setItem('docling_endpoint', 'http://127.0.0.1:8008')
   ```
   - Atualize a página (Ctrl+R) e faça o upload do PDF.

4) Parar o serviço Docling:

   ```powershell
   scripts/stop-docling.ps1
   ```

Se preferir iniciar manualmente o serviço Docling (modo desenvolvedor):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008
```

### 🛠️ Solução de Problemas (Windows)

- Caminhos com acentos: se o repositório estiver em um caminho com acentos (ex.: “verção”), libs nativas podem falhar.
  - Use o venv externo: `scripts/setup-external-venv.ps1 -VenvPath C:\docling-venv` e inicie com `scripts/run-docling-detached.ps1 -VenvPath C:\docling-venv`.
  - Ou mova o repositório para um caminho ASCII.
- Porta 8008 não sobe: veja `scripts/logs/*.err.log` e rode novamente `scripts/run-docling-detached.ps1` (o script já espera ~30s pelo readiness).
- Front acusa “Docling Offline”: garanta o endpoint via Console (código acima) e acesse `http://127.0.0.1:8008/health`.

## Dica/Diagnóstico no Windows: caminhos com acentos

Se o caminho do repositório tiver caracteres não ASCII (por exemplo, "verção"), algumas bibliotecas nativas usadas pelo Docling (pacote `docling_parse`) podem falhar ao localizar arquivos de recursos internos e produzir erros como:

```
RuntimeError: filename does not exists: ...\docling_parse\pdf_resources_v2\glyphs\standard\additional.dat
```

Como mitigar:

- Use um ambiente virtual externo em um caminho ASCII e inicie o serviço com ele:

   ```powershell
   # criar venv externo (uma vez)
   scripts/setup-external-venv.ps1 -VenvPath C:\docling-venv

   # iniciar o serviço usando esse venv
   scripts/run-docling-detached.ps1 -VenvPath C:\docling-venv
   ```

- Alternativa: mova/clonar o repo para um diretório com caminho ASCII.

Os logs do serviço ficam em `scripts/logs/*.err.log` e ajudam a confirmar a causa.
