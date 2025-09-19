# TODO - PDF OCR Pro - Próximos Passos

## 📋 Status Atual do Projeto

### ✅ FUNCIONALIDADES IMPLEMENTADAS
- **Extração via Docling**: Integração completa com PyPdfiumDocumentBackend
- **Limpeza de Markdown**: Remoção automática de artefatos e caracteres indesejados
- **Interface Otimizada**: Frontend React com painéis de configuração e diagnóstico
- **Sistema Unificado**: Arquivo `start.bat` único para inicialização completa
- **Worker Estável**: Processamento isolado sem crashes de memória
- **Extração de Headlines**: Funcionando e marcando tanto headlines quanto footnotes

### 🔧 PROBLEMAS IDENTIFICADOS PARA CORREÇÃO

#### 1. **EXTRAÇÃO DE FOOTNOTES - ALTA PRIORIDADE**
**Problema**: Botão específico para extração de footnotes não está funcionando
**Localização**: 
- Frontend: `components/ExtractorToggle.tsx` 
- Service: `services/openrouterFootnote.ts`
- Configuração: `services/aiService.ts`

**O que precisa ser feito**:
- [ ] Verificar binding do botão footnote no ExtractorToggle
- [ ] Debugar chamada para openrouterFootnote.ts
- [ ] Validar se o endpoint está sendo chamado corretamente
- [ ] Testar integração com aiService.ts

**Arquivos para investigar**:
```
components/ExtractorToggle.tsx     -> Interface do botão
services/openrouterFootnote.ts    -> Lógica de extração
services/aiService.ts              -> Orquestração dos serviços
```

#### 2. **REFINAMENTO DA EXTRAÇÃO DE HEADLINES - MÉDIA PRIORIDADE**
**Problema**: Extração de headlines está processando footnotes também
**Localização**: `services/openrouterHeadline.ts`

**O que precisa ser feito**:
- [ ] Modificar prompt para focar APENAS em headlines
- [ ] Ajustar regex/filtros para ignorar footnotes
- [ ] Testar separação clara entre headlines e footnotes
- [ ] Otimizar prompt em `prompts/doclingTemplates.ts`

**Arquivos para modificar**:
```
services/openrouterHeadline.ts    -> Lógica principal
prompts/doclingTemplates.ts       -> Templates de prompt
```

#### 3. **MELHORIA DO TERCEIRO PASSO - BAIXA PRIORIDADE**
**Problema**: Terceiro passo do processamento precisa de refinamento
**Localização**: `services/openrouterTextLevel.ts`

**O que precisa ser melhorado**:
- [ ] Definir claramente qual é o objetivo do terceiro passo
- [ ] Melhorar prompt e lógica de processamento
- [ ] Integrar melhor com os passos anteriores
- [ ] Adicionar validação de qualidade do output

## 🛠️ GUIA PARA DESENVOLVEDORES

### Como Debugar Problemas

#### **Extração de Footnotes**
1. **Frontend Debug**:
   ```typescript
   // Em components/ExtractorToggle.tsx
   console.log('Footnote button clicked:', buttonState);
   ```

2. **Service Debug**:
   ```typescript
   // Em services/openrouterFootnote.ts
   console.log('Footnote extraction input:', text);
   console.log('Footnote extraction result:', result);
   ```

3. **Network Debug**:
   - Abrir DevTools > Network
   - Verificar chamadas para `/extract-footnotes`
   - Validar payload e response

#### **Headlines Focus**
1. **Prompt Adjustment**:
   ```typescript
   // Em prompts/doclingTemplates.ts
   // Modificar template para ser mais específico sobre headlines
   ```

2. **Response Filtering**:
   ```typescript
   // Em services/openrouterHeadline.ts
   // Adicionar filtros para remover footnotes do resultado
   ```

### Estrutura dos Serviços

```
services/
├── aiService.ts              -> Orquestrador principal
├── openrouterHeadline.ts     -> Extração de cabeçalhos
├── openrouterFootnote.ts     -> Extração de notas de rodapé
├── openrouterTextLevel.ts    -> Processamento de terceiro nível
├── doclingService.ts         -> Interface com Docling
└── masterPrompt.ts           -> Prompts principais
```

### Como Testar Mudanças

1. **Teste Individual de Serviço**:
   ```bash
   # Testar worker Docling
   python scripts/docling_worker.py --pdf test.pdf --mode simple
   ```

2. **Teste Frontend Completo**:
   ```bash
   # Iniciar aplicação completa
   ./start.bat
   ```

3. **Debug de Extração**:
   - Upload de PDF
   - Abrir DevTools > Console
   - Monitorar logs de cada passo

## 🎯 ROADMAP PARA PERFEIÇÃO

### **Fase 1: Correções Críticas** (1-2 dias)
- [ ] Fix botão footnotes
- [ ] Separar headlines de footnotes
- [ ] Testes de regressão

### **Fase 2: Refinamentos** (2-3 dias)
- [ ] Melhorar terceiro passo
- [ ] Otimizar prompts
- [ ] Adicionar mais validações

### **Fase 3: Polimento** (1 dia)
- [ ] Documentação final
- [ ] Testes de performance
- [ ] UI/UX improvements

## 🔍 DEBUGGING QUICK REFERENCE

### **Logs Importantes**
```bash
# Backend logs
tail -f scripts/logs/docling-*.out.log

# Frontend console
# DevTools > Console > Filter: "EXTRACTION" | "FOOTNOTE" | "HEADLINE"
```

### **Endpoints de Teste**
- Docling Health: `http://127.0.0.1:8008/health`
- Frontend: `http://localhost:5173`
- API Docs: `http://127.0.0.1:8008/docs`

### **Arquivos de Configuração Críticos**
- `docling_service.py` -> Backend principal
- `services/aiService.ts` -> Orquestração frontend
- `scripts/docling_worker.py` -> Worker de processamento
- `start.bat` -> Inicialização do sistema

---

**Última atualização**: 19 de setembro de 2025
**Status**: 80% completo - Funcional com melhorias identificadas
**Prioridade**: Footnotes > Headlines > TextLevel