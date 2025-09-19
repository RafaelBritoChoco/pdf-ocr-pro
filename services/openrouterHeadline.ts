import { ProcessingMode } from '../types';
import { callOpenRouter } from './openRouterService';
import { buildMasterPrompt } from './masterPrompt';
import { getHeadlinesTaskDocling, getTablePreservationGuard } from '../prompts/doclingTemplates';

export interface ORHeadlineArgs {
  main_chunk_content: string;
  continuous_context_summary: string;
  previous_chunk_overlap: string;
  next_chunk_overlap: string;
  onApiCall: () => void;
  mode: ProcessingMode;
  model?: string;
}

export async function processHeadlinesChunkOpenRouter(args: ORHeadlineArgs): Promise<string> {
  args.onApiCall();
  const task = getHeadlinesTaskDocling() + '\n' + getTablePreservationGuard();
  const prompt = buildMasterPrompt({
    continuous_context_summary: args.continuous_context_summary,
    previous_chunk_overlap: args.previous_chunk_overlap,
    next_chunk_overlap: args.next_chunk_overlap,
    task_instructions: task,
    main_chunk_content: args.main_chunk_content,
    injectFootnoteBlock: false,
    includeTaggingExamples: false
  });
  const model = args.model || localStorage.getItem('openrouter_model') || 'qwen/qwen-2.5-7b-instruct';
  const temperature = 0.1;
  try {
    const result = await callOpenRouter({ model, temperature, messages: [{ role: 'user', content: prompt }] });
    const finalText = (result || '').trim() || args.main_chunk_content;
    return finalText;
  } catch (e) {
    console.warn('[OpenRouter][Headline] erro', e);
    return args.main_chunk_content;
  }
}
