import dotenv from 'dotenv';
import { llmService } from './services/llmClient';

dotenv.config();

async function main() {
  console.log('Starting debug for llmClient...');
  try {
    const response = await llmService.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello, world!',
      config: { temperature: 0.1 }
    });
    console.log('LLM response:', response.text);
  } catch (error) {
    console.error('Error during llmService.generateContent:', error);
  }
}

main();
