# Diretrizes Globais de Prompts para Docling (v2)

Objetivo: adaptar a lógica de prompts altamente eficaz do "ProjetoFuncional" (Gemini/Studio AI) para o novo pipeline com extração via Docling, substituindo pdf.js, mantendo alta precisão em textos curtos e ruidosos. Este documento define princípios, estratégia de fases e modelos de prompts prontos para uso.

---

## Princípios extraídos do ProjetoFuncional

1. Fidelidade absoluta ao texto
   - Nunca resuma, parafraseie, nem omita conteúdo. Tamanho de saída ≈ tamanho de entrada (variação apenas pelos tags inseridos e correções pontuais).
   - Preservar todos os dígitos exatamente (anos, decimais, números de cláusulas, marcadores de nota).

2. Processamento por fases com contratos claros
   - Separar etapas: limpeza mínima, marcação de notas de rodapé, marcação de títulos, marcação de corpo, etc.
   - Cada fase recebe um contrato: o que pode e o que não pode alterar.

3. Regras negativas explícitas
   - "Proibido": não duplicar títulos, não inventar notas, não mover notas, não alterar maiúsculas/minúsculas, não alterar tabelas.

4. Contexto limitado e overlaps
   - Usar resumo contínuo + overlaps de chunk para coerência, mas a saída deve refletir apenas o chunk principal.

5. Guardas para textos curtos e casos ambíguos
   - Em entradas muito pequenas, conservar quase que literalmente; só aplicar a ação mínima necessária.

6. Autochecagem numérica
   - Instruir o modelo a conservar contagens de números e sinalizar autoverificação (quando aplicável).

7. Awareness de formato de saída do extrator
   - Com Docling, o conteúdo vem em Markdown; manter cercas de código, tabelas e sintaxe Markdown intactas.

---

## Estratégia de pipeline (Docling)

1) Extração (Docling)
   - Modos: simple (rápido, PDFs legíveis) e advanced (OCR + tabelas). Registrar meta (páginas, modo, arquivo).
   - Saída: Markdown. Não pós-formatar agressivamente nesta fase.

2) Normalização determinística pré-LLM (leve)
   - `services/textCleanup.ts`: remoção de números de página isolados, headers/footers repetidos curtos, junção de hifenização de quebra de linha, sem tocar dígitos.

3) Chunking consciente de parágrafos
   - `services/chunkingService.ts`: separar por parágrafos mantendo blocos lógicos.
   - Overlaps curtos no início/fim para coerência.

4) Fase 0 – "Resgate de texto curto" (se < ~500–800 chars)
   - Aplicar um micro-prompt conservador que só corrige erros óbvios sem perder conteúdo.

5) Fase 1 – Limpeza assistida por LLM (opcional)
   - Remover metadados de página remanescentes e corrigir erros de OCR leves, preservando Markdown, tabelas e dígitos.

6) Fase 2 – Marcação de notas de rodapé
   - Marcar referências inline e a linha de definição correspondente, sem mover ou renumerar.

7) Fase 3 – Marcação de títulos (headline)
   - Envolver somente títulos com `{{levelX}}...{{-levelX}}` (X = 0/1/2), sem duplicar.

8) Fase 4 – Marcação de corpo
   - Envolver blocos de corpo com `{{text_level}}...{{-text_level}}` e subestruturas com `{{level3+}}`.
   - Não tocar notas já marcadas.

9) QA – Integridade numérica e de estrutura
   - Verificar que contagem de dígitos não caiu de forma inesperada.
   - Checar que tabelas Markdown e cercas de código permanecem idênticas.

---

## Convenções Globais para Docling (Markdown-aware)

- Não modificar:
  - Tabelas Markdown (linhas com `|`, cabeçalho `| --- |`).
  - Cercas de código ``` e conteúdo interno.
  - Blocos de imagem/legenda, links, anchors Markdown.
- Cabeçalhos Markdown (#, ##) devem ser preservados; se forem títulos estruturais, envolver o texto com as tags sem remover o `#`.
- Quebras de linha: manter onde existirem; normalizar apenas múltiplas em branco excessivas se instruído.

---

## Modelos de Prompt (exemplares)

Os templates abaixo estão prontos para uso via `prompts/doclingTemplates.ts`.

1) Cabeçalho mestre (Docling)
- Objetivo: garantir regras globais de fidelidade, Markdown-aware e guardas de comprimento.
- Uso: prefixo no Master Prompt de chunk.

2) Limpeza (Docling)
- Objetivo: remover metadados remanescentes e corrigir ruídos, preservando Markdown e números.

3) Notas de rodapé
- Objetivo: marcar `{{footnotenumberN}}` e `{{footnoteN}}` sem reordenar nem renumerar.

4) Títulos (headline)
- Objetivo: marcar apenas títulos (níveis 0–2) e não tocar parágrafos.

5) Corpo (content)
- Objetivo: envolver o corpo sob um título com `{{text_level}}`, marcando subníveis com `level3+`.

6) Resgate de texto curto
- Objetivo: preservar máxima fidelidade em entradas pequenas/ambíguas.

7) Guardas para tabelas e código
- Objetivo: reforçar proibições de qualquer ajuste em tabelas/código.

8) Autochecagem numérica
- Objetivo: instruções para o modelo preservar contagem de dígitos (comportamento conservador se incerto).

---

## Integração recomendada

- Substituir a string embutida do MASTER PROMPT em `services/geminiService.ts` pelo builder `buildMasterPrompt` (já existe) + `DOC_HEADER_V2` de `doclingTemplates`.
- Habilitar modo `advanced` do Docling quando o PDF não for nativamente pesquisável.
- Aplicar `cleanText()` antes do chunking, com opções conservadoras.
- Para curtos: aplicar `getSmallTextRescue()` como tarefa inicial.
- Para documentos com tabelas visíveis: anexar `getTablePreservationGuard()` ao cabeçalho do prompt.
- Usar `getFootnotesTaskDocling()` antes de `getHeadlinesTaskDocling()` e depois `getBodyContentTaskDocling()`.

---

## Métricas e diagnóstico

- Registrar baseline numérica (já suportado no cliente) e comparar após cada fase.
- Contar linhas de tabela antes/depois; devem ser idênticas.
- Amostrar chunks curtos aleatórios e verificar variação percentual de tamanho (< 8–12%).
- Registrar taxa de sucesso por tipo: notas, títulos, tabelas, limpeza.

---

## Observações finais

- Os modelos fornecidos seguem o mesmo esquema de tags já utilizado no projeto (`{{levelX}}`, `{{text_level}}`, `{{footnotenumberN}}`, `{{footnoteN}}`).
- A estratégia prioriza segurança em cenários de texto curto e preservação de elementos Markdown do Docling, replicando a precisão observada no "ProjetoFuncional".
