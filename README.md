<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PDF OCR Pro 2.4 – Extração + Estruturação Inteligente

**🎯 Status: 80% Completo - Funcional com melhorias identificadas**

App local para extração de texto de PDFs com integração Docling e estruturação assistida por IA. Prioriza privacidade: o PDF bruto não sai do seu ambiente; somente trechos de texto são enviados ao provedor de IA escolhido.

## 🚀 Início Rápido

**Modo Simples - Um Clique:**
1. Execute: `start.bat` (duplo-clique)
2. Aguarde a aplicação abrir no navegador
3. Faça upload do PDF e processe!

## 📋 Status Atual do Sistema

### ✅ **Funcionalidades Implementadas**
- **Extração Docling**: PyPdfiumDocumentBackend otimizado e estável
- **Limpeza de Markdown**: Remove artefatos automáticamente (~2.5s de processamento)
- **Interface Moderna**: Frontend React com painéis de diagnóstico
- **Worker Isolado**: Sem crashes de memória (OSError 1455 resolvido)
- **Extração Headlines**: Funcional (mas processa footnotes também)
- **Sistema Unificado**: Arquivo único `start.bat` para tudo

### 🔧 **Próximas Melhorias** (Ver [TODO.md](TODO.md) para detalhes)
1. **🚨 CRÍTICO**: Botão footnotes não funciona
2. **📊 MÉDIO**: Headlines processando footnotes junto  
3. **🔄 BAIXO**: Terceiro passo precisa refinamento

### 🛠️ **Para Desenvolvedores**
- **Debug Footnotes**: `components/ExtractorToggle.tsx` + `services/openrouterFootnote.ts`
- **Fix Headlines**: Ajustar prompts em `prompts/doclingTemplates.ts`
- **Logs**: DevTools Console + `scripts/logs/docling-*.out.log`

## Run Locally

**Prerequisites:** Node.js + Python 3.8+

### **Método Recomendado - Auto Setup**
1. Execute: `start.bat` (duplo-clique)
   - Cria venv automaticamente
   - Instala dependências Python e Node.js
   - Inicia backend + frontend
   - Abre navegador

### **Método Manual**
1. Instalar dependências Node.js: `npm install`
2. Criar ambiente Python: `python -m venv .venv`
3. Ativar venv: `.venv\Scripts\activate` (Windows)
4. Instalar Python deps: `pip install -r requirements.txt`
5. Iniciar backend: `python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008`
6. Iniciar frontend: `npm run dev`

## 🏗️ Arquitetura do Sistema

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend       │    │   Docling       │
│   React:5173    │◄──►│   FastAPI:8008   │◄──►│   Worker        │
│                 │    │                  │    │   (Isolated)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
  - ExtractorToggle      - docling_service.py    - docling_worker.py
  - ResultViewer         - AI Services           - PyPdfiumBackend
  - ConfigScreen         - OpenRouter/Gemini     - Markdown Cleanup
```

### **Fluxo de Processamento**
1. **Upload**: Frontend → Backend FastAPI
2. **Extração**: Backend → Docling Worker (isolado)
3. **Processamento IA**: Backend → OpenRouter/Gemini APIs
4. **Resultado**: Backend → Frontend (exibição)

### **Principais Componentes**
- `start.bat`: Inicialização completa do sistema
- `docling_service.py`: API backend FastAPI
- `scripts/docling_worker.py`: Worker isolado de processamento  
- `services/aiService.ts`: Orquestração de IA no frontend
- `components/ExtractorToggle.tsx`: Interface de extração

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
Arquivo: `services/tagIntegrityService.ts` (auditorias locais e telemetria em localStorage). Chamado automaticamente em `App.tsx` após cada etapa para armazenar snapshots.

### Boas Práticas de Modelos OpenRouter
- Prefira modelos com instrução clara (ex: Qwen Instruct, Llama Instruct) para tagging determinístico.
- Temperatura baixa (0.1–0.2) reduz risco de omissão de tags.
- Use chunk count que mantenha cada pedaço < 8k tokens para minimizar truncamento.

### Licença

MIT. Veja `LICENSE`.

---

## 🔄 Modo Clone Total (Paridade Gemini)

Desde a revisão de setembro/2025, o fluxo OpenRouter pode operar em modo **clone total**:

Características principais:
- Mesmo MASTER PROMPT do Gemini (arquivo único `services/masterPrompt.ts`).
- Temperatura fixa em 0.1 e primeira resposta usada diretamente (sem pré-limpeza/enforcement/sanitização).
- Menor risco de duplicações ou divergências por passes adicionais.

Arquivos relevantes:
- `services/masterPrompt.ts`
- `services/aiService.ts`

### Extração com Docling (OpenRouter)

Opcionalmente, quando o provedor ativo for OpenRouter, a extração inicial pode usar a biblioteca Docling via um microserviço Python local.

1) Instale dependências Python (apenas uma vez, de preferência via script): veja seção "Início Rápido (Windows)" abaixo para criar um venv externo e instalar.

2) Execute o serviço local (automático pelos scripts abaixo, ou manualmente se preferir):

    - Windows PowerShell (manual):
       `python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008`

3) No app, com provedor OpenRouter selecionado:

   - Modo Simples (FAST) -> Docling `simple` (sem OCR, rápido, PDFs machine-readable)
   - Modo Avançado (QUALITY) -> Docling `advanced` (com OCR e estrutura de tabelas)

Para o provedor OpenRouter, Docling é obrigatório para a extração inicial; se o serviço não estiver disponível, o processamento não iniciará até o serviço ficar online.

Para customizar o endpoint do serviço Docling, defina em localStorage: `docling_endpoint` (ex.: `http://127.0.0.1:8008`).

Teste rápido: acesse `http://127.0.0.1:8008/health` e verifique `{ "status": "ok" }` com o serviço ligado.

---

## ⚡️ Início Rápido (Windows) – Docling + Front

Pré‑requisitos: Python 3.10+, Node.js 18+, PowerShell.

1) Rodar tudo automaticamente (recomendado no Windows):

   - Duplo‑clique em `scripts/start-app.bat` ou rode:

   ```bat
   scripts\start-app.bat
   ```

   Alternativa via npm:

   ```bat
   npm run start:app
   ```

   O script único idempotente fará:
   - Criar/ativar `.venv` local se necessário.
   - Instalar dependências Python mínimas apenas se faltarem.
   - Subir Docling (se não estiver rodando) e aguardar health (até 30s, curl ou PowerShell).
   - Iniciar frontend Vite (se não estiver rodando) e abrir o navegador apenas nessa primeira inicialização.

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
\.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn docling_service:app --host 127.0.0.1 --port 8008
```

### 🛠️ Solução de Problemas (Windows)

- Caminhos com acentos: se o repositório estiver em um caminho com acentos (ex.: “verção”), libs nativas podem falhar.
  - Use o venv externo: `scripts/setup-external-venv.ps1 -VenvPath C:\docling-venv` e inicie com `scripts/run-docling-detached.ps1 -VenvPath C:\docling-venv`.
  - Ou mova o repositório para um caminho ASCII.
- Porta 8008 não sobe: veja `scripts/logs/*.err.log` e rode novamente `scripts/run-docling-detached.ps1` (o script já espera ~30s pelo readiness).
- Front acusa “Docling Offline”: garanta o endpoint via Console (código acima) e acesse `http://127.0.0.1:8008/health`.

#### Por que meu servidor para depois de um tempo sem usar?

Possíveis causas e como mitigar:

- Janela/terminal encerrado: se a janela do Vite (npm run dev) for fechada, o servidor cai. Deixe a janela aberta ou use novamente `scripts/start-app.bat` (idempotente) para reabrir.
- Sleep/hibernação ou logoff: processos de usuário são finalizados ao sair da sessão; o sleep pode interromper redes/handles. Evite logoff, ajuste energia para não hibernar durante o uso ou use o watchdog abaixo.
- Queda do Docling por exceção: verifique o último `scripts/logs/*.err.log`. Se houver crash esporádico, o watchdog reinicia automaticamente.
- Porta em uso após retomada: se 8008 foi tomada por outro processo, pare e reinicie (`scripts/stop-docling.ps1` e depois `scripts/run-docling-detached.ps1`).

Watchdog (reinício automático do Docling):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\docling-watchdog.ps1 -VenvPath C:\docling-venv -IntervalSeconds 60
```

---

## 🤖 Modo Automático de Extração (Docling)

O serviço Python agora aceita `mode=auto` em `/extract`.

Heurística (rápida, sem carregar modelos pesados antes da decisão):
- Lê até 5 primeiras páginas com `pypdf`.
- Soma caracteres extraídos.
- Conta imagens (/XObject Image).
- Regras:
   - Média de caracteres/página < 400 (default) → `advanced` (provável PDF escaneado ou denso em imagem)
   - Número de imagens >= páginas analisadas → `advanced`
   - Caso contrário → `simple`.
   - Falha de leitura → fallback `simple`.

Personalização: defina `DOCLING_AUTO_TEXT_THRESHOLD=300` (por exemplo) antes de iniciar o serviço para ajustar sensibilidade.

Metadados retornados (`meta`):
```
requested_mode: 'auto'
mode: 'simple' | 'advanced'
fallback_used: bool
fallback_reason: string | null
auto_threshold_chars_per_page: "400" (se auto)
```

No frontend já usamos por padrão `mode=auto` (veja `services/doclingService.ts`).

## ▶️ Script Único para Iniciar Tudo

Use `scripts/start-app.bat` (Windows) para:
1. Criar/ativar venv.
2. Instalar dependências (somente se faltando).
3. Subir Docling (se estiver parado) aguardando `/health`.
4. Iniciar frontend (se parado).
5. Abrir navegador (apenas na primeira vez dessa execução).

### Script Único Idempotente (`scripts/start-app.bat`)
Para um uso ainda mais simples há agora o script `scripts/start-app.bat` que:

- Cria/ativa a venv se necessário.
- Instala dependências mínimas se faltarem.
- Só inicia o Docling se ele NÃO estiver rodando na porta configurada (default 8008).
- Só inicia o frontend (Vite) se ele NÃO estiver na porta 5173.
- Abre o navegador apenas quando inicia o frontend pela primeira vez.
- Pode ser executado várias vezes sem gerar processos duplicados.

Uso:
1. Duplo‑clique em `scripts/start-app.bat`.
2. Se já estava tudo rodando, você verá mensagens `[SKIP]` e nada quebra.
3. Se a porta 8008 estiver ocupada por outro processo estranho, você receberá aviso e poderá parar o processo manualmente antes de reiniciar.

Variáveis no topo do script (descomente para ajustar):
```
REM set DOCLING_LIGHT_MODE=1        (força modo simple / leve)
REM set DOCLING_DISABLE_FALLBACK=1  (desativa fallback de memória)
REM set DOCLING_AUTO_TEXT_THRESHOLD=500  (altera heurística do modo auto)
```

Se quiser integrar watchdog automático, pode acrescentar depois do bloco Docling:
```
start "DoclingWatch" powershell -ExecutionPolicy Bypass -NoProfile -File scripts\docling-watchdog.ps1 -IntervalSeconds 20 -VenvPath .\.venv
```

---

### Fluxo para o Usuário Final
1. Baixar/clonar o projeto.
2. Duplo‑clique em `scripts/start-app.bat`.
3. Navegador abre em `http://localhost:5173`.
4. Fazer upload de qualquer PDF (texto legível ou escaneado).
5. O sistema escolhe automaticamente o modo de extração (simple vs advanced) sem ação manual.

### Como a Decisão Acontece (Resumo Simples)
- Lê rapidamente algumas páginas do PDF.
- Se quase não tem texto ou tem muitas imagens → ativa OCR (advanced).
- Se já tem texto estruturado → usa modo rápido (simple).
- Se memória falta em advanced → tenta fallback para simple.

### Ajustes Opcionais
| Desejo | O que fazer |
|--------|-------------|
| Forçar sempre modo leve | Definir `set DOCLING_LIGHT_MODE=1` no `.bat` |
| Desativar retry por memória | `set DOCLING_DISABLE_FALLBACK=1` |
| Ajustar sensibilidade do auto | `set DOCLING_AUTO_TEXT_THRESHOLD=300` (ou outro) |

### Ver Metadados da Última Extração
Abra o console do navegador (F12) e rode:
```js
JSON.parse(localStorage.getItem('last_docling_meta')||'null')
```

### Chamada via curl (exemplo)
```bash
curl -F "file=@meu.pdf" "http://127.0.0.1:8008/extract?mode=auto" -o resultado.json
```

### Erros Comuns
| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Offline no frontend | Docling ainda iniciando | Aguarde ou clique Detectar |
| Fallback usado | Falta de memória no advanced | Aumente paginação virtual ou aceite simple |
| Porta ocupada | Outro processo na 8008 | Feche processo ou mude `DOCLING_PORT` no `.bat` |

---
*Se quiser empacotar isso em um instalador ou adicionar logs mais detalhados, abra uma issue.*

Variáveis opcionais (descomente no topo do .bat):
```
set DOCLING_LIGHT_MODE=1        # força sempre simple, ignorando OCR
set DOCLING_DISABLE_FALLBACK=1  # desativa retry de memória
set DOCLING_AUTO_TEXT_THRESHOLD=500  # ajusta decisão do modo auto
```

## 🧪 Exemplos de Uso via curl

```bash
curl -F "file=@relatorio.pdf" "http://127.0.0.1:8008/extract?mode=auto" > saida.json
```

Modo fixo:
```bash
curl -F "file=@relatorio.pdf" "http://127.0.0.1:8008/extract?mode=advanced" > saida.json
```

## 📦 Próximos (Sugestões)
- Script `extract-one.bat` chamando cliente CLI Python (auto por default)
- Exibir badge na UI quando `auto` decidir por `advanced` ou usar fallback de memória
- Adicionar variável `DOCLING_AUTO_MAX_PAGES` para limitar páginas analisadas.

---

O watchdog verifica periodicamente `http://127.0.0.1:8008/health` e, se falhar, roda novamente `run-docling-detached.ps1`.

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
