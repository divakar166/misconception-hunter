import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { SuggestTopicResponse } from '@/types/conversation';

type SuggestTopicDeps = {
  createOpenAIClient: typeof createOpenAI;
  generateTextImpl: typeof generateText;
};

const SUGGEST_TOPIC_SYSTEM_PROMPT = `You write a single loaded question for a Socratic misconception-hunting tutor to open a session with.

Rules:
- Scope: computer science and AI fundamentals only — programming fundamentals, algorithms & complexity, data structures, machine learning reasoning, or AI systems reasoning.
- The question must target a specific, well-known misconception in that area — something a student could plausibly get wrong (or get right for the wrong reason).
- Output ONLY the question itself, as one sentence, phrased naturally for speech. No preamble, no quotes, no explanation.`;

export function createSuggestTopicHandler({
  createOpenAIClient,
  generateTextImpl,
}: SuggestTopicDeps) {
  return async function POST() {
    const apiKey = process.env.NEXT_LLM_API_KEY;
    const llmUrl = process.env.NEXT_LLM_URL;
    const modelId = 'openai/gpt-oss-120b';

    if (!apiKey || !llmUrl) {
      return NextResponse.json(
        { error: 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set' },
        { status: 500 },
      );
    }

    const baseURL = llmUrl.replace(/\/chat\/completions\/?$/, '');
    const openai = createOpenAIClient({ apiKey, baseURL });

    try {
      const { text } = await generateTextImpl({
        // .chat() targets the Chat Completions API surface — see the note
        // in app/api/session-summary/route.ts for why this matters on Groq.
        model: openai.chat(modelId),
        system: SUGGEST_TOPIC_SYSTEM_PROMPT,
        prompt: 'Suggest one question.',
        temperature: 1,
      });

      const topic = text.trim().replace(/^["']|["']$/g, '');
      if (!topic) {
        throw new Error('Empty suggestion from model');
      }

      return NextResponse.json({ topic } satisfies SuggestTopicResponse);
    } catch (err) {
      console.error('[suggest-topic] Failed to generate a suggestion:', err);
      return NextResponse.json(
        { error: 'Failed to generate a topic suggestion' },
        { status: 502 },
      );
    }
  };
}

export const POST = createSuggestTopicHandler({
  createOpenAIClient: createOpenAI,
  generateTextImpl: generateText,
});
