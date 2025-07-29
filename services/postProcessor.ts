/**
 * Post-processamento para validação e garantia de estrutura
 * 
 * Este módulo adiciona uma camada de validação após o processamento pelo LLM
 * para garantir que a estrutura do documento seja mantida corretamente.
 * 
 * @file postProcessor.ts
 * @author PDF-OCR-Pro Team
 */

/**
 * Aplica regras de post-processamento para garantir que a estrutura do documento esteja correta
 * @param text Texto formatado pelo LLM
 * @returns Texto com regras de formatação garantidas
 */
export function applyPostProcessingRules(text: string): string {
  if (!text) return text;
  
  // Quebra o texto em linhas para processamento
  let lines = text.split('\n');
  let result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
    
    // Regra 1: Título de artigo deve estar em sua própria linha
    if (/^ARTICLE\s+[IVX]+\s+/.test(currentLine)) {
      // Se é um título de artigo, garantir que termine aqui e não continue
      const articlePattern = /^(ARTICLE\s+[IVX]+\s+[A-Z\s\-]+)(.+)$/;
      const match = currentLine.match(articlePattern);
      
      if (match) {
        // Título seguido de texto no mesmo parágrafo - separe-os
        result.push(match[1].trim());
        result.push('');  // Linha em branco após título
        result.push(match[2].trim());
      } else {
        // Apenas o título
        result.push(currentLine);
        
        // Adiciona linha em branco após título se não existir
        if (nextLine && nextLine.trim() !== '') {
          result.push('');
        }
      }
      
      continue;
    }
    
    // Regra 2: Itens numerados devem estar em suas próprias linhas
    if (/^\d+\.\s+/.test(currentLine)) {
      const numberedItemPattern = /^(\d+\.\s+[^:]+:)(.+)$/;
      const match = currentLine.match(numberedItemPattern);
      
      if (match) {
        // Item numerado seguido de texto após dois pontos - separe-os
        result.push(match[1].trim());
        result.push(match[2].trim());
      } else {
        result.push(currentLine);
      }
      
      continue;
    }
    
    // Regra 3: Sub-itens devem estar em suas próprias linhas
    if (/^\s*\([a-z]+\)\s+/.test(currentLine)) {
      // Adiciona indentação consistente para sub-itens
      if (!currentLine.startsWith('   ')) {
        result.push('   ' + currentLine.trim());
      } else {
        result.push(currentLine);
      }
      
      continue;
    }
    
    // Regra 4: Remover espaços entre palavras e pontuação
    const correctedLine = currentLine.replace(/\s+([,.;:)])/g, '$1');
    
    // Adiciona a linha ao resultado
    result.push(correctedLine);
  }
  
  return result.join('\n');
}

/**
 * Valida se a estrutura do documento está correta após o processamento
 * @param text Texto formatado
 * @returns Objeto com informações de validação
 */
export function validateDocumentStructure(text: string): { 
  valid: boolean, 
  issues: Array<{type: string, line: number, description: string}>
} {
  const issues: Array<{type: string, line: number, description: string}> = [];
  const lines = text.split('\n');
  
  // Validação de artigos
  lines.forEach((line, index) => {
    // Verifica se algum título de artigo está junto com texto
    if (/^ARTICLE\s+[IVX]+\s+[A-Z\s\-]+[a-z]/.test(line)) {
      issues.push({
        type: 'article_title',
        line: index + 1,
        description: 'Título de artigo misturado com texto'
      });
    }
    
    // Verifica se há espaços antes de pontuação
    if (/\w\s+[,.;:]/.test(line)) {
      issues.push({
        type: 'spacing',
        line: index + 1,
        description: 'Espaços incorretos antes de pontuação'
      });
    }
    
    // Verifica se itens numerados estão misturados com texto
    if (/^\d+\.\s+[^:]+:.+/.test(line)) {
      issues.push({
        type: 'numbered_item',
        line: index + 1,
        description: 'Item numerado misturado com texto após dois pontos'
      });
    }
  });
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Função completa que aplica pós-processamento e validação
 * @param text Texto formatado pelo LLM
 * @returns Texto validado e corrigido
 */
export function processAndValidate(text: string): {
  processedText: string,
  validation: { valid: boolean, issues: Array<{type: string, line: number, description: string}> }
} {
  // Aplicar regras de pós-processamento
  const processedText = applyPostProcessingRules(text);
  
  // Validar o resultado
  const validation = validateDocumentStructure(processedText);
  
  return {
    processedText,
    validation
  };
}
