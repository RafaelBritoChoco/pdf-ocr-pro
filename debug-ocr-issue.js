// Debug script para testar o problema do OCR
// Este script simula o processo de análise para entender por que o OCR não foi executado

// Simular texto extraído de um PDF como o ASEAN document
const sampleExtractedText = `
--- END OF PAGE 1 ---
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

--- END OF PAGE 1 ---
`;

console.log('🔍 Analisando texto extraído do PDF ASEAN...');
console.log('📄 Comprimento do texto:', sampleExtractedText.length);
console.log('📝 Número de palavras:', sampleExtractedText.split(/\s+/).length);

// Simular a análise que seria feita por findProblematicPages
function analyzeTextQuality(text) {
    const issues = [];
    
    // Verificar se há texto suficiente
    if (text.length < 100) {
        issues.push('Texto muito curto - possível falha na extração');
    }
    
    // Verificar caracteres problemáticos
    const problematicChars = /[^\w\s\-.,;:'"!?()[\]{}]/g;
    const problematicMatches = text.match(problematicChars);
    if (problematicMatches && problematicMatches.length > 10) {
        issues.push(`Caracteres problemáticos encontrados: ${problematicMatches.length}`);
    }
    
    // Verificar se há muitos números/códigos que podem indicar OCR ruim
    const numberSequences = text.match(/\d{3,}/g);
    if (numberSequences && numberSequences.length > 5) {
        issues.push(`Sequências numéricas suspeitas: ${numberSequences.length}`);
    }
    
    // Verificar quebras de linha estranhas
    const oddLineBreaks = text.match(/\w\n\w/g);
    if (oddLineBreaks && oddLineBreaks.length > 3) {
        issues.push(`Quebras de linha suspeitas: ${oddLineBreaks.length}`);
    }
    
    return issues;
}

const qualityIssues = analyzeTextQuality(sampleExtractedText);
console.log('🔍 Problemas de qualidade encontrados:', qualityIssues);

if (qualityIssues.length === 0) {
    console.log('✅ Texto parece estar bem extraído - IA pode ter decidido que não precisa de OCR');
    console.log('⚠️ ESTE PODE SER O PROBLEMA: A IA não identificou necessidade de OCR!');
} else {
    console.log('❌ Texto tem problemas - deveria ter sido enviado para OCR');
}

// Simular como o sistema atual decide se precisa de OCR
function simulateCurrentLogic(pageText) {
    // Esta é a lógica atual do sistema
    if (pageText.length > 100) {
        return 'TEXTO_SUFICIENTE - Não precisa de OCR';
    } else if (pageText.length > 0) {
        return 'POUCO_TEXTO - Pode precisar de correção';
    } else {
        return 'SEM_TEXTO - Precisa de OCR';
    }
}

const decision = simulateCurrentLogic(sampleExtractedText);
console.log('🤖 Decisão do sistema atual:', decision);

// Possíveis soluções
console.log('\n💡 POSSÍVEIS SOLUÇÕES:');
console.log('1. Forçar OCR em páginas com características específicas');
console.log('2. Melhorar a análise de qualidade do texto extraído');
console.log('3. Adicionar verificação manual de qualidade');
console.log('4. Implementar threshold mais baixo para texto "problemático"');
