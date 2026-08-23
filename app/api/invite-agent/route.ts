import { NextRequest, NextResponse } from 'next/server';
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
} from 'agora-agents';
import { ClientStartRequest, AgentResponse } from '@/types/conversation';
import { DEFAULT_AGENT_UID } from '@/lib/agora';

// System prompt that defines the agent's personality and behavior.
// Swap this out to change what the agent talks about.
const MISCONCEPTION_HUNTER_PROMPT = `You are the **Misconception Hunter**, a Socratic learning companion. Your job is NOT to answer questions or teach facts. Your job is to understand *how a student is reasoning* about a concept and find out whether that reasoning has a misconception hiding in it.

# Your Scope
For this session, focus on a small set of foundational concepts you can probe deeply (pick whichever the student brings up or drifts toward — do not introduce unrelated topics):
- Basic mechanics: force, motion, gravity, inertia
- Basic math reasoning: fractions, ratios, negative numbers, percentages
- Basic programming reasoning: variables, loops, recursion, references vs. values

If the student raises a topic outside these areas, gently redirect: acknowledge it, then steer toward one of the above.

# The Core Rule: Investigate Before You Correct
You are explicitly forbidden from acting like a normal answer-giving tutor. When a student gives an answer:
- Do NOT immediately say whether it's right or wrong.
- Do NOT explain the correct concept unprompted.
- Instead, ask them HOW they got there: "What made you think that?" / "Walk me through your reasoning." / "What would happen if...?"
Only after you have enough evidence about their *reasoning process* — not just their final answer — should you address correctness, and even then prefer another probing question over a lecture.

# What You're Listening For
Every response falls into one of five buckets. Keep a working sense (in your own reasoning, not spoken aloud) of which bucket the student is currently in, and let it drive your next question:
1. **Correct answer + correct reasoning** — confirm briefly, then raise the difficulty (a harder or edge-case variant).
2. **Correct answer + incorrect reasoning** — the answer got lucky. Probe with a variant where their flawed reasoning would produce the WRONG answer, and see what they say.
3. **Incorrect answer + correct underlying concept** — likely a slip, not a misconception. A light nudge or a "check that again" is enough; don't over-probe.
4. **Incorrect answer + a misconception** — this is what you're hunting for. Keep gathering evidence (2-3 more targeted questions) before you name it.
5. **Insufficient evidence** — you genuinely can't tell yet. Ask another question rather than guessing. Never declare a misconception on a single data point.

# Declaring a Misconception
Do not say "you have a misconception" casually. Only state it once you have real evidence across multiple exchanges (a pattern, not a slip), and when you do, describe the specific flawed rule they seem to be applying, not just "you're wrong." After naming it, ask one question designed to test whether they can see the conflict themselves before you explain anything.

# Session Memory
This is a continuous conversation. Actively refer back to what the student said earlier in the session — their prior answers, corrections they made, things they were unsure about. If a later answer contradicts an earlier one, point that out and ask which one they trust more. Track their uncertainty: if they hedge ("I think", "maybe", "not sure"), treat that as a signal worth exploring, not something to smooth over.

# Persona & Tone
- Curious and warm, like a peer thinking out loud with them — never clinical or exam-like.
- Genuinely interested in HOW they think, not just whether they're right.

# Core Behavior Guidelines
- **Default to brief**: This is a voice conversation. Keep most turns to 1–2 sentences.
- **Never list or enumerate**: No bullet points, no numbered steps, ever, out loud.
- **Ask at most one question per turn**: Never stack questions.
- **Never lecture unprompted**: If you must eventually explain something, keep it to one sentence and follow it with a question.
- **It's fine to say you're not sure yet**: If the evidence is mixed, say so and ask another question instead of forcing a verdict.`;

// First thing the agent says when a user joins the channel.
const GREETING = `Hey, I'm here to think through a concept with you — pick something you've been learning, and tell me your answer to a question about it. I'm more interested in how you got there than whether it's right.`;

// agentUid identifies the AI in the RTC channel and shares its default with the client.
const agentUid = String(DEFAULT_AGENT_UID);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    // --- 1. Parse request ---

    const body: ClientStartRequest = await request.json();
    const { requester_id, channel_name } = body;

    // Validate required env vars on first request so misconfiguration surfaces
    // with a clear error message rather than a silent failure.
    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');

    if (!channel_name || !requester_id) {
      return NextResponse.json(
        { error: 'channel_name and requester_id are required' },
        { status: 400 },
      );
    }

    // --- 2. Build and start the agent ---

    // AgoraClient authenticates API calls to the Agora Conversational AI service.
    // area: change to Area.EU or Area.AP for European or Asia-Pacific deployments.
    const client = new AgoraClient({
      area: Area.US,
      appId,
      appCertificate,
    });

    // Pipeline: Deepgram (reseller) STT → OpenAI (reseller) LLM → MiniMax (reseller) TTS.
    // Omit vendor API keys for supported models — AgentKit infers reseller presets on start (see Agora Console / billing).
    const agent = new Agent({
      client,
      instructions: MISCONCEPTION_HUNTER_PROMPT,
      greeting: GREETING,
      failureMessage: 'Please wait a moment.',
      maxHistory: 50,
      // VAD controls how the agent detects the start and end of a user's turn.
      turnDetection: {
        config: {
          speech_threshold: 0.5,
          start_of_speech: {
            mode: 'vad',
            vad_config: {
              interrupt_duration_ms: 160, // ms of speech before interruption triggers
              prefix_padding_ms: 300, // audio captured before speech is detected
            },
          },
          end_of_speech: {
            mode: 'vad',
            vad_config: {
              // Longer than the Ada default (480ms) — students pause mid-answer to think
              // through their reasoning; cutting them off there breaks the Socratic flow.
              silence_duration_ms: 700,
            },
          },
        },
      },
      // RTM is required for transcript events in the browser client.
      // enable_tools is required for MCP tool invocation.
      advancedFeatures: { enable_rtm: true, enable_tools: true },
      // Required for browser RTM events:
      // - data_channel: 'rtm' enables RTM delivery path for state/metrics/errors
      // - enable_error_message emits AGENT_ERROR payloads
      // - enable_metrics emits AGENT_METRICS latency payloads
      parameters: {
        // web client → ultra-low-latency chorus profile
        audio_scenario: 'chorus',
        data_channel: 'rtm',
        enable_error_message: true,
        enable_metrics: true,
      },
    })
      .withStt(
        new DeepgramSTT({
          model: 'nova-3',
          language: 'en',
        }),
        // BYOK: uncomment the following block and set NEXT_DEEPGRAM_API_KEY
        // new DeepgramSTT({
        //   apiKey: requireEnv('NEXT_DEEPGRAM_API_KEY'),
        //   model: 'nova-3',
        //   language: 'en',
        // }),
      )
      .withLlm(
        new OpenAI({
          model: 'gpt-4o-mini',
          greetingMessage: GREETING,
          failureMessage: 'Please wait a moment.',
          // Raised from 15 — misconception-hunting threads span more turns than a
          // support Q&A, and earlier answers in the session need to stay in context.
          maxHistory: 30,
          params: {
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.95,
          },
        }),
        // BYOK: uncomment the following block and set NEXT_LLM_API_KEY and NEXT_LLM_URL
        // new OpenAI({
        //   apiKey: requireEnv('NEXT_LLM_API_KEY'),
        //   url: requireEnv('NEXT_LLM_URL'),
        //   model: 'gpt-4o-mini',
        //   greetingMessage: GREETING,
        //   failureMessage: 'Please wait a moment.',
        //   maxHistory: 15,
        //   maxTokens: 1024,
        //   temperature: 0.7,
        //   topP: 0.95,
        // }),
      )
      .withTts(
        new MiniMaxTTS({
          model: 'speech_2_6_turbo',
          voiceId: 'English_captivating_female1',
        }),
        // BYOK — ElevenLabs (set NEXT_ELEVENLABS_API_KEY; optional NEXT_ELEVENLABS_VOICE_ID)
        // new (await import('agora-agents')).ElevenLabsTTS({
        //   key: requireEnv('NEXT_ELEVENLABS_API_KEY'),
        //   modelId: 'eleven_flash_v2_5',
        //   voiceId: process.env.NEXT_ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB',
        //   sampleRate: 24000,
        // }),
      );

    // remoteUids restricts the agent to only process audio from this user
    const session = agent.createSession({
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.hours(1),
      debug: false, // enable debug to show restful API calls in the console
    });

    const agentId = await session.start();

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
    } as AgentResponse);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to start conversation',
      },
      { status: 500 },
    );
  }
}
