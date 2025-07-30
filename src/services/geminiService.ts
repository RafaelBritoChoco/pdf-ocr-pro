// Dentro de src/services/geminiService.ts
import { llmService, getModel } from './llmClient'; // Assegure-se de que getModel é importado

export async function enrichTextWithStructuralTags(rawText: string): Promise<string> {
    console.log(`[geminiService] Stage 2: Starting AI structural enrichment for ${rawText.length} chars.`);

    const systemInstruction = `You are a structural text analyzer for legal documents. Your ONLY task is to analyze the following raw text and wrap each distinct element in a simple structural tag. DO NOT alter, correct, or rephrase the content in any way. Preserve every original word, punctuation mark, and line break within elements.\n\n    - Wrap headings and article titles in <h>...</h>.\n    - Wrap numbered or lettered list items in <li>...</li>.\n    - Wrap regular paragraphs of text in <p>...</p>.\n    - Wrap the full content of footnote definitions in <fn>...</fn>.\n\n    Your output must be only the tagged text.`;

    const CHUNK_SIZE = 30000;
    if (rawText.length < CHUNK_SIZE) {
        const { response } = await llmService.generateContent({ model: getModel(), contents: [{ role: 'user', parts: [{ text: systemInstruction }, { text: rawText }] }] });
        return response.text() || rawText;
    }

    const chunks = [];
    for (let i = 0; i < rawText.length; i += CHUNK_SIZE) {
        chunks.push(rawText.slice(i, i + CHUNK_SIZE));
    }
    const processedChunks = await Promise.all(chunks.map(async (chunk) => {
        const { response } = await llmService.generateContent({ model: getModel(), contents: [{ role: 'user', parts: [{ text: systemInstruction }, { text: chunk }] }] });
        return response.text() || chunk;
    }));
    return processedChunks.join('\n');
}

