// Teste rápido da API Gemini
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });

async function testGemini() {
  try {
    console.log('🔑 API Key:', process.env.GEMINI_API_KEY ? 'Configurada' : 'NÃO ENCONTRADA');
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    console.log('🧪 Testando modelo gemini-2.5-flash...');
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Responda apenas: OK"
    });
    
    console.log('✅ Resposta da API:', response.text);
    console.log('🎉 Modelo gemini-2.5-flash funcionando!');
    
  } catch (error) {
    console.error('❌ Erro no modelo gemini-2.5-flash:', error.message);
    
    // Testar com modelo alternativo
    try {
      console.log('🔄 Testando modelo alternativo...');
      const response2 = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: "Responda apenas: OK"
      });
      console.log('✅ Modelo alternativo funcionou:', response2.text);
    } catch (error2) {
      console.error('❌ Erro no modelo alternativo:', error2.message);
    }
  }
}

testGemini();
