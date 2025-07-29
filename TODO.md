---

# Histórico de Mudanças (Changelog)

## [2024-06-08]
- Prompt robusto, especialista e padronizado aplicado em `reformatDocumentText` e `reformatLargeDocumentInChunks`.
- TODOs de prompt marcados como concluídos.
- Refinamento crítico do prompt para resolver erros específicos de formatação:
  - Correção do problema de junção de títulos de artigos com parágrafos
  - Correção do problema de espaços extras entre palavras e pontuação
  - Correção do problema de listas numeradas e sub-listas fundidas
  - Melhoria da hierarquia de elementos com instruções explícitas
  - Adição de exemplos negativos (o que NÃO fazer) para evitar erros comuns
- Contexto, riscos e melhores práticas documentados.

## [2024-06-07]
- Criação inicial do TODO.md com contexto, riscos e plano de implementação.


# CONTEXTO FUNDAMENTAL PARA LLM, DESENVOLVEDORES E JURISTAS

## Riscos e Impacto
- **Risco Jurídico:** Qualquer alteração acidental na camada lexical pode invalidar um documento legal, gerar insegurança jurídica ou até responsabilidade civil.
- **Risco de Perda de Estrutura:** Se a camada estrutural não for restaurada corretamente, o texto pode perder valor probatório, dificultar a leitura ou causar interpretações erradas.
- **Dependências:** O sucesso da diagramação depende da qualidade do OCR e da correta identificação de padrões estruturais pelo LLM.

## Recomendações Práticas para Desenvolvedores e LLMs
- Sempre valide se o texto final mantém 100% do conteúdo original (caracter por caracter).
- Teste com exemplos reais de leis, contratos e documentos acadêmicos.
- Use logs e comparações automáticas para garantir que apenas a estrutura visual foi alterada.
- Se possível, envolva um revisor humano (jurista) para validar documentos críticos.

## Interdependências Críticas
- O prompt afeta diretamente a qualidade da extração OCR e a experiência do usuário final.
- A integridade documental é fundamental: alterações acidentais de conteúdo podem ter consequências legais graves.
- O pipeline deve ser robusto para lidar com documentos em uma linha só, textos com listas, títulos, artigos, tabelas e notas de rodapé.

## Como evoluir este TODO
- Sempre que uma melhoria for implementada, registre exemplos de antes/depois no próprio TODO para referência futura.
- Se surgirem novos padrões estruturais, adicione-os ao prompt e à documentação.
- Mantenha este arquivo como fonte única de verdade para o contexto do projeto.

## Princípio Cognitivo Central
Para resolver o problema de diagramação, estabeleça uma separação clara entre camadas de informação:
1. **Camada Lexical** (palavras, caracteres, símbolos) - IMUTÁVEL
2. **Camada Estrutural** (quebras de linha, espaçamento, indentação) - MUTÁVEL

## Prompt Especialista a ser aplicado (em ambas as funções):
```
ROLE: Document Structure Engineer specializing in legal text formatting.

MISSION: Transform raw text into professionally structured documents by modifying ONLY the visual presentation layer while preserving ALL lexical content.

TECHNICAL DEFINITIONS (CRITICAL):
• "LEXICAL CONTENT" (MUST PRESERVE): All words, characters, punctuation marks, symbols, and alphanumeric strings.
• "VISUAL PRESENTATION" (MUST MODIFY): Line breaks, paragraph spacing, indentation, and visual hierarchy.

PERMISSIBLE OPERATIONS (EXHAUSTIVE LIST):
✓ ADD line breaks between logical document units
✓ INSERT blank lines for structural delineation
✓ ADJUST indentation for hierarchical representation
✓ REMOVE page markers and artifacts ("--- END OF PAGE X ---")
✓ NORMALIZE whitespace between paragraphs and sections

PROHIBITED OPERATIONS (EXHAUSTIVE LIST):
✗ NO modification of any word, character or punctuation
✗ NO correction of spelling, grammar, or language
✗ NO alteration of numerical values or references
✗ NO insertion or deletion of content markers
✗ NO reordering or restructuring of semantic content

STRUCTURAL PATTERN RECOGNITION:
1. LEGAL HIERARCHY:
   • Title/Chapter indicators: "ARTICLE X", "CHAPTER Y", "TITLE Z" → Place on dedicated line with preceding blank line
   • Section markers: "Section X.Y", "§ X" → Place on dedicated line
   • Numbered items: [1., 2., (a), (b), I., II.] → Format as indented list items

2. PARAGRAPH DELINEATION:
   • Topic transitions → New paragraph with blank line before
   • Extended sentences (>100 chars with no breaks) → Analyze for logical break points
   • Narrative shift → New paragraph

EXAMPLES OF CORRECT TRANSFORMATION:
Input: "ARTICLE 5. Jurisdiction. The court shall have jurisdiction over all matters arising under this Agreement including but not limited to disputes between the Parties."
Output:
ARTICLE 5. Jurisdiction.

The court shall have jurisdiction over all matters arising under this Agreement including but not limited to disputes between the Parties.

Input: "1. The Parties agree as follows: (a) to maintain confidentiality; (b) to act in good faith; and (c) to resolve disputes amicably."
Output:
1. The Parties agree as follows: 
   (a) to maintain confidentiality; 
   (b) to act in good faith; and 
   (c) to resolve disputes amicably.

VERIFICATION PROTOCOL:
• Every heading must appear on its own line
• Lists must have items on separate lines with consistent indentation
• All original text must remain unmodified at the character level
• Document structure must reflect logical organization and hierarchy

RETURN: Only the reformatted text with no commentary.
```

## 🚀 Prioridade Alta - Correções Imediatas

- [x] **Reformular e Padronizar os Prompts de Diagramação**
    - [x] Substituir o prompt ambíguo atual por um que deixe claro: "modificar APENAS layout visual, NUNCA o texto" (ver Prompt Especialista acima).
    - [x] Usar o mesmo prompt otimizado tanto em `reformatDocumentText` quanto em `reformatLargeDocumentInChunks` (garantir consistência).
    - [x] Adicionar instrução explícita: "SE o texto estiver em uma linha só, DEVE quebrar em parágrafos/títulos" (ver exemplos no Prompt Especialista).
    - [x] Adicionar exemplos específicos de padrões estruturais no prompt (ARTICLE X, Section Y, numbered lists, ver Prompt Especialista).

## 🔧 Melhorias Técnicas (Futuro)

- [ ] **Otimizar o Processamento de Chunks**
    - [ ] Garantir que quebras entre chunks não afetem a estrutura do documento.
    - [ ] Implementar sistema de contextualização entre chunks adjacentes.

- [ ] **Melhorar o Feedback Visual**
    - [ ] Adicionar log de comparação "antes/depois" para visualizar as mudanças de diagramação.
    - [ ] Criar visualização side-by-side do texto original vs. formatado.

- [ ] **Sistemas de Validação (Futuro)**
    - [ ] Adicionar validador automático para detectar problemas comuns (e.g., títulos colados com texto).
    - [ ] Implementar verificações de qualidade da diagramação.

## 🧪 Testes e Validação (Futuro)

- [ ] **Criar Casos de Teste Específicos**
    - [ ] Documento com tudo em uma linha.
    - [ ] Documento com títulos/artigos.
    - [ ] Documento com listas numeradas/com marcadores.
    - [ ] Documento com tabelas.

- [ ] **Comparação Automática**
    - [ ] Implementar sistema para verificar se o conteúdo textual permanece idêntico após formatação.

- [ ] **Documentar Exemplos de Antes/Depois**
    - [ ] Criar uma seção ou arquivo com exemplos reais de entrada (OCR bruto) e saída (após diagramação LLM), destacando:
        - [ ] Casos de sucesso (estrutura preservada, texto intacto)
        - [ ] Casos problemáticos (mudança de texto, estrutura errada)
    - [ ] Usar esses exemplos para validar futuras alterações de prompt e para onboarding de novos desenvolvedores/LLM trainers.
    - [ ] Atualizar sempre que novos padrões ou problemas forem identificados.
