import { NextRequest, NextResponse } from 'next/server';
import { generateObject, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type {
  SessionSummaryRequest,
  SessionSummaryResponse,
  SessionSummaryTurn,
} from '@/types/conversation';
import { getClientIp, llmRouteLimiter } from '@/lib/rate-limit';

type SessionSummaryDeps = {
  createOpenAIClient: typeof createOpenAI;
  generateObjectImpl: typeof generateObject;
};

const summarySchema = jsonSchema<SessionSummaryResponse>({
  type: 'object',
  properties: {
    topic: {
      type: 'string',
      description:
        'Short label for the concept discussed, e.g. "adding fractions with unlike denominators".',
    },
    overallAssessment: {
      type: 'string',
      enum: [
        'concept_understood',
        'misconception_confirmed',
        'insufficient_evidence',
      ],
    },
    misconceptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'The specific flawed rule the student appeared to apply.',
          },
          confidence: { type: 'number', description: '0-1' },
          evidence: {
            type: 'array',
            items: { type: 'string' },
            description: 'Short lines quoting or paraphrasing what revealed this.',
          },
        },
        required: ['description', 'confidence', 'evidence'],
        additionalProperties: false,
      },
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'What the student reasoned about correctly.',
    },
    recommendedNextSteps: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete, specific revision topics or practice suggestions.',
    },
    escalation: {
      type: 'object',
      properties: {
        recommended: {
          type: 'boolean',
          description:
            'True if a teacher should review this session — a confirmed misconception, or the student asking for/needing human help.',
        },
        reason: {
          type: 'string',
          description: 'One sentence explaining why, or "" if not recommended.',
        },
      },
      required: ['recommended', 'reason'],
      additionalProperties: false,
    },
  },
  required: [
    'topic',
    'overallAssessment',
    'misconceptions',
    'strengths',
    'recommendedNextSteps',
    'escalation',
  ],
  additionalProperties: false,
});

const SUMMARY_SYSTEM_PROMPT = `You are producing an end-of-session learning report from a transcript of a Socratic misconception-hunting tutoring conversation. Read the whole transcript and assess the student's REASONING, not just their final answers.

Rules:
- Only report a misconception if the transcript shows a pattern across multiple turns — a single wrong answer alone is not enough evidence. If the evidence is thin, use overallAssessment "insufficient_evidence" and leave misconceptions empty or low-confidence.
- "concept_understood" means the student demonstrated correct reasoning, not just correct answers.
- strengths and recommendedNextSteps should be specific to what actually happened in this transcript, not generic study advice.
- Set escalation.recommended to true when: a misconception is confirmed with confidence >= 0.75, OR the transcript shows the student explicitly asking for a teacher/human, or expressing they're stuck or frustrated rather than just uncertain. Otherwise false, with reason "".`;

function formatTranscript(transcript: SessionSummaryTurn[]): string {
  return transcript
    .map((turn) => `${turn.role === 'user' ? 'Student' : 'Tutor'}: ${turn.text}`)
    .join('\n');
}

export function createSessionSummaryHandler({
  createOpenAIClient,
  generateObjectImpl,
}: SessionSummaryDeps) {
  return async function POST(request: NextRequest) {
    if (llmRouteLimiter) {
      const { success } = await llmRouteLimiter.limit(getClientIp(request));
      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests from this address — please wait a bit and try again.' },
          { status: 429 },
        );
      }
    }

    const apiKey = process.env.NEXT_LLM_API_KEY;
    const llmUrl = process.env.NEXT_LLM_URL;
    // Change this to switch models without other config changes.
    const modelId = 'openai/gpt-oss-120b';

    if (!apiKey || !llmUrl) {
      return NextResponse.json(
        { error: 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set' },
        { status: 500 },
      );
    }

    let body: SessionSummaryRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!Array.isArray(body.transcript) || body.transcript.length === 0) {
      return NextResponse.json(
        { error: 'transcript is required and must be a non-empty array' },
        { status: 400 },
      );
    }

    const baseURL = llmUrl.replace(/\/chat\/completions\/?$/, '');
    const openai = createOpenAIClient({ apiKey, baseURL });

    try {
      const { object: summary } = await generateObjectImpl({
        // .chat() targets the Chat Completions API surface, which is what
        // Groq (and most OpenAI-compatible backends) support — the bare
        // call defaults to OpenAI's newer, less widely supported Responses API.
        model: openai.chat(modelId),
        schema: summarySchema,
        system: SUMMARY_SYSTEM_PROMPT,
        prompt: formatTranscript(body.transcript),
      });

      return NextResponse.json(summary satisfies SessionSummaryResponse);
    } catch (err) {
      console.error('[session-summary] Failed to generate summary:', err);
      return NextResponse.json(
        { error: 'Failed to generate session summary' },
        { status: 502 },
      );
    }
  };
}

export const POST = createSessionSummaryHandler({
  createOpenAIClient: createOpenAI,
  generateObjectImpl: generateObject,
});
