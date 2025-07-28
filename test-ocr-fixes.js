// Script de teste para verificar se as melhorias de detecção OCR funcionam
// Simula o caso do documento ASEAN

const mockTextAsean = `--- END OF PAGE 1 ---
ASEAN TRADE IN SERVICES AGREEMENT

The Governments of Brunei Darussalam, the Kingdom of
Cambodia, the Republic of Indonesia, Lao People's
Democratic Republic, Malaysia, the Republic of the Union of
Myanmar, the Republic of the Philippines, the Republic of
Singapore, the Kingdom of Thailand, the Socialist
Republic of Viet Nam, Member States of the Association of
Southeast Asian Nations (ASEAN), hereinafter collectively
referred to as "Member States" or singularly as "Member
State";

NOTING the ASEAN Framework Agreement on Services
signed by the ASEAN Economic Ministers (AEM) on 15
December 1995 in Bangkok, Thailand (hereinafter referred to
as "AFAS") and its subsequent Implementing Protocols, the
objectives of which are to enhance cooperation in services
amongst Member States, to eliminate substantially all
restrictions to trade in services amongst Member States, and
to liberalise trade in services by expanding the depth and
scope of liberalisation beyond those undertaken by Member
States under the General Agreement on Trade in Services
(GATS);

TAKING INTO ACCOUNT the mandate of the 7th ASEAN
Economic Community Council held on 2 April 2012 in Phnom
Penh, Cambodia to review and enhance the existing AFAS, to
enhance ASEAN's economic and sectoral integration in the
same vein that ASEAN has transformed the Framework
Agreement on the ASEAN Investment Area and the ASEAN
Agreement for the Promotion and Protection of Investments,
and the Agreement on the Common Effective Preferential
Tariff Scheme for the ASEAN Free Trade Area into the
ASEAN Comprehensive Investment Agreement (ACIA) and
the ASEAN Trade In Goods Agreement, respectively;

--- END OF PAGE 1 ---`;

// Simular a função de análise local melhorada
function analyzeTextQualityLocally(rawText) {
  const issues = [];
  const problematicPages = [];
  
  // Dividir por páginas
  const pageTexts = rawText.split(/--- END OF PAGE \d+ ---/);
  
  pageTexts.forEach((pageText, index) => {
    const pageNum = index + 1;
    const pageIssues = [];
    const trimmedText = pageText.trim();
    
    if (trimmedText.length === 0) return; // Skip empty pages
    
    console.log(`📄 Analisando página ${pageNum}: ${trimmedText.length} caracteres`);
    
    // Verificar comprimento muito baixo
    if (trimmedText.length < 200) {
      pageIssues.push('Texto muito curto');
      problematicPages.push(pageNum);
      console.log(`⚠️ Página ${pageNum}: Texto muito curto (${trimmedText.length} chars)`);
    }
    
    // Verificar quebras de linha estranhas (texto cortado)
    const oddLineBreaks = trimmedText.match(/\w\n\w/g);
    if (oddLineBreaks && oddLineBreaks.length > 3) {
      pageIssues.push('Quebras de linha suspeitas');
      problematicPages.push(pageNum);
      console.log(`⚠️ Página ${pageNum}: ${oddLineBreaks.length} quebras de linha suspeitas`);
    }
    
    // Verificar falta de espaços entre palavras
    const missingSpaces = trimmedText.match(/[a-z][A-Z]/g);
    if (missingSpaces && missingSpaces.length > 5) {
      pageIssues.push('Possível falta de espaços');
      problematicPages.push(pageNum);
      console.log(`⚠️ Página ${pageNum}: ${missingSpaces.length} possíveis faltas de espaço`);
    }
    
    // Verificar densidade de caracteres especiais (pode indicar OCR ruim)
    const specialChars = trimmedText.match(/[^\w\s\-.,;:'"!?()[\]{}]/g);
    if (specialChars && specialChars.length > trimmedText.length * 0.05) {
      pageIssues.push('Muitos caracteres especiais');
      problematicPages.push(pageNum);
      console.log(`⚠️ Página ${pageNum}: ${specialChars.length} caracteres especiais (${((specialChars.length/trimmedText.length)*100).toFixed(1)}%)`);
    }
    
    // Verificar se o texto parece vir de scan (muito quebrado)
    const words = trimmedText.split(/\s+/);
    const brokenWords = trimmedText.match(/\b\w{1,2}\b/g);
    if (brokenWords && brokenWords.length > words.length * 0.3) {
      pageIssues.push('Palavras muito fragmentadas');
      problematicPages.push(pageNum);
      console.log(`⚠️ Página ${pageNum}: ${brokenWords.length} palavras fragmentadas de ${words.length} total`);
    }
    
    if (pageIssues.length > 0) {
      issues.push(`Página ${pageNum}: ${pageIssues.join(', ')}`);
    } else {
      console.log(`✅ Página ${pageNum}: Nenhum problema detectado`);
    }
  });
  
  return {
    issues,
    problematicPages: [...new Set(problematicPages)]
  };
}

// Simular a lógica adicional do usePdfProcessor
function additionalCriteria(text, pageNum) {
  const additionalIssues = [];
  
  if (text.length < 150) {
    additionalIssues.push('Texto muito curto para OCR');
  }
  
  if (text.split(/\s+/).length < 20) {
    additionalIssues.push('Muito poucas palavras');
  }
  
  if ((text.match(/\w\n\w/g) || []).length > 2) {
    additionalIssues.push('Quebras estranhas');
  }
  
  if (text.includes('□') || text.includes('■')) {
    additionalIssues.push('Caracteres de placeholder');
  }
  
  if (/[^\x00-\x7F]/.test(text.slice(0, 100))) {
    additionalIssues.push('Caracteres não-ASCII no início');
  }
  
  return additionalIssues;
}

console.log('🔍 TESTE DE DETECÇÃO DE PROBLEMAS OCR');
console.log('=====================================');

const localResult = analyzeTextQualityLocally(mockTextAsean);
console.log('\n📋 RESULTADO DA ANÁLISE LOCAL:');
console.log('Issues:', localResult.issues);
console.log('Páginas problemáticas:', localResult.problematicPages);

// Testar critérios adicionais
console.log('\n🔍 TESTE DE CRITÉRIOS ADICIONAIS:');
const pageTexts = mockTextAsean.split(/--- END OF PAGE \d+ ---/);
pageTexts.forEach((pageText, index) => {
  if (pageText.trim().length === 0) return;
  const pageNum = index + 1;
  const additional = additionalCriteria(pageText.trim(), pageNum);
  if (additional.length > 0) {
    console.log(`⚠️ Página ${pageNum} - Critérios adicionais: ${additional.join(', ')}`);
  } else {
    console.log(`✅ Página ${pageNum} - Nenhum critério adicional ativado`);
  }
});

console.log('\n💡 CONCLUSÃO:');
if (localResult.problematicPages.length > 0) {
  console.log(`✅ SUCESSO: ${localResult.problematicPages.length} página(s) seriam enviadas para OCR`);
  console.log('🎯 O problema foi resolvido com a detecção local melhorada!');
} else {
  console.log('❌ Ainda não detectou problemas. Pode precisar de ajustes adicionais.');
}
