import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = 'AIzaSyAQ2G3iTq-ncvefA-a6T8dfo_VYR1IudzU';

async function testGeminiAPI() {
  try {
    console.log('🔍 Testando conexão com API Gemini...');
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    console.log('📡 Fazendo chamada para API...');
    const result = await model.generateContent('Hello world, respond with just "OK"');
    
    console.log('✅ API funcionando! Resposta:', result.response.text());
    
    // Agora vamos testar com um texto maior, similar ao que usamos no PDF
    console.log('\n🧪 Testando com texto maior...');
    const largerTest = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `Please analyze this text for extraction errors and provide a brief analysis:

"This is a sample text that might have some extraction errors like missing spaces,incorrect punctuation,or broken formatting."

Just respond with "ANALYSIS COMPLETE" if successful.`
        }]
      }]
    });
    
    console.log('✅ Teste maior funcionando! Resposta:', largerTest.response.text());
    
  } catch (error) {
    console.error('❌ Erro na API:', error.message);
    console.error('Stack:', error.stack);
  }
}

testGeminiAPI();
