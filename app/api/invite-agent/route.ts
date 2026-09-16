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
import { createTicket, verifyTicket } from '@/lib/session-ticket';
import { checkDailyAgentBudget, getClientIp, inviteAgentLimiter } from '@/lib/rate-limit';

interface AgoraSessionTicket {
  channel: string;
  uid: string;
}

interface AgentControlTicket {
  agentId: string;
  channel: string;
}

// Kept aligned with EXPIRATION_TIME_IN_SECONDS in generate-agora-token/route.ts
// and the `expiresIn` below — a control ticket only needs to outlive the
// agent session it authorizes.
const CONTROL_TICKET_TTL_SECONDS = 3600;

// System prompt that defines the agent's personality and behavior.
// Swap this out to change what the agent talks about.
const MISCONCEPTION_HUNTER_PROMPT = `You are the **Misconception Hunter**, a Socratic learning companion. Your job is NOT to answer questions or teach facts. Your job is to understand *how a student is reasoning* about a concept and find out whether that reasoning has a misconception hiding in it.

# Your Scope
For this session, focus on a small set of foundational computer science and AI concepts you can probe deeply (pick whichever the student brings up or drifts toward — do not introduce unrelated topics):
- Programming fundamentals: variables, loops, recursion, references vs. values
- Algorithms & complexity: what Big-O actually measures, how running time scales with input size
- Data structures: why different structures (arrays, hash sets, trees) have different performance tradeoffs
- Machine learning reasoning: how a model learns from training data, overfitting vs. generalizing, what accuracy numbers actually mean
- AI systems reasoning: where bias in AI systems comes from, what "more parameters/layers" does and doesn't guarantee

If the student raises a topic outside these areas, gently redirect: acknowledge it, then steer toward one of the above. Exception: if your opening greeting already named a specific topic (student-supplied or suggested), treat that topic as in-scope for this session even if it isn't explicitly listed above.

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

# Human Escalation
You are not a substitute for a teacher, and you should say so plainly when it matters:
- If the student explicitly asks for a real teacher/tutor, or seems frustrated/stuck rather than just uncertain, don't push the Socratic questioning further — acknowledge it and say this session will be flagged for their teacher to review.
- If you confirm a misconception with strong evidence, mention once — briefly, not as a lecture — that it'll show up in a summary their teacher can see, so they're not left to self-correct alone.
- Never claim authority you don't have. You are a conversation partner helping surface reasoning, not a grader or a final authority on whether something is "wrong."

# Persona & Tone
- Curious and warm, like a peer thinking out loud with them — never clinical or exam-like.
- Genuinely interested in HOW they think, not just whether they're right.

# Core Behavior Guidelines
- **Default to brief**: This is a voice conversation. Keep most turns to 1–2 sentences.
- **Never list or enumerate**: No bullet points, no numbered steps, ever, out loud.
- **Ask at most one question per turn**: Never stack questions.
- **Never lecture unprompted**: If you must eventually explain something, keep it to one sentence and follow it with a question.
- **It's fine to say you're not sure yet**: If the evidence is mixed, say so and ask another question instead of forcing a verdict.`;

// Starter questions the agent opens with — one picked at random per session.
// Each targets a specific, well-known misconception in one of the CS/AI
// domains from MISCONCEPTION_HUNTER_PROMPT's scope, so the first exchange
// already has something concrete to probe instead of asking the student to
// invent a topic cold.
const CONCEPT_STARTERS = [
  'if you pass an array into a function and the function changes one of its elements, does that change show up outside the function too?',
  'does a loop that runs from i equals zero while i is less than ten go ten times or eleven times?',
  'what do you think happens if a recursive function is called but it has no base case?',
  "if you double the size of the input to an algorithm that runs in O(n log n) time, does the running time also just double?",
  'if you want to check whether a value exists in a list of a million items, is searching a plain array just as fast as using a hash set?',
  "if a machine learning model gets ninety nine percent accuracy on its training data, does that mean it'll do just as well on new, unseen data?",
  'if an AI model is trained on a huge amount of data, does that automatically mean its predictions are unbiased?',
  'does a neural network with more layers always perform better than one with fewer layers?',
] as const;

// `topic` may be a full loaded question (from the "Suggest one" LLM button —
// mirrors the shape of CONCEPT_STARTERS) or a bare phrase the student typed
// themselves (e.g. "recursion"). Phrasing branches on whether it reads as a
// question so either input produces a natural-sounding opener.
function pickGreeting(topic?: string): string {
  const trimmedTopic = topic?.trim();
  if (trimmedTopic) {
    return trimmedTopic.endsWith('?')
      ? `Hey! Let's think through something together — ${trimmedTopic} Tell me your answer, and walk me through how you got there.`
      : `Hey! Let's think through ${trimmedTopic} together. Tell me something you believe about it, and walk me through why you think that.`;
  }

  const starter =
    CONCEPT_STARTERS[Math.floor(Math.random() * CONCEPT_STARTERS.length)];
  return `Hey! Let's think through something together — ${starter} Tell me your answer, and walk me through how you got there.`;
}

// agentUid identifies the AI in the RTC channel and shares its default with the client.
const agentUid = String(DEFAULT_AGENT_UID);

// Hard ceiling on how long a single agent session may run, in seconds.
// Was ExpiresIn.hours(1) with no client-side cap — fine for local dev, not
// for a publicly shared demo link, where an engaged (or forgotten) tab is a
// real, uncapped Agora bill. Shared with the client via
// NEXT_PUBLIC_MAX_SESSION_SECONDS so the UI can show a countdown and
// self-end the call at the same limit the server enforces.
const MAX_SESSION_SECONDS = Number(process.env.NEXT_PUBLIC_MAX_SESSION_SECONDS) || 600;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    // --- 1. Rate limits — checked before doing any other work, since this
    // route is the one that actually spends money (Agora agent-minutes). ---

    if (inviteAgentLimiter) {
      const { success } = await inviteAgentLimiter.limit(getClientIp(request));
      if (!success) {
        return NextResponse.json(
          { error: 'Too many session starts from this address — please wait a few minutes and try again.' },
          { status: 429 },
        );
      }
    }

    // --- 2. Parse request ---

    const body: ClientStartRequest = await request.json();
    const { ticket, topic } = body;

    // Validate required env vars on first request so misconfiguration surfaces
    // with a clear error message rather than a silent failure.
    const appId = requireEnv('NEXT_PUBLIC_AGORA_APP_ID');
    const appCertificate = requireEnv('NEXT_AGORA_APP_CERTIFICATE');

    // channel_name/requester_id come ONLY from a verified ticket, never from
    // the request body directly — otherwise any caller could start a paid
    // agent session in a channel they don't own (or one already in use).
    const sessionPayload = verifyTicket<AgoraSessionTicket>(ticket);
    if (!sessionPayload) {
      return NextResponse.json(
        { error: 'Invalid or expired session ticket' },
        { status: 401 },
      );
    }
    const channel_name = sessionPayload.channel;
    const requester_id = sessionPayload.uid;

    // --- 2. Build and start the agent ---

    // Uses the student-supplied/suggested topic if given, otherwise picks a
    // fresh random starter so repeat demos don't open on the same question.
    const greeting = pickGreeting(topic);

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
      greeting,
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
          greetingMessage: greeting,
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

    // Global daily cap on actual agent starts — checked here (right before
    // actually starting a paid session), not earlier, so it isn't consumed
    // by requests that never had a valid ticket in the first place.
    const budget = await checkDailyAgentBudget();
    if (!budget.ok) {
      console.warn(`[invite-agent] Daily agent-session budget hit: ${budget.used}/${budget.limit}`);
      return NextResponse.json(
        { error: 'This demo has reached its session limit for today — please check back tomorrow.' },
        { status: 429 },
      );
    }

    // remoteUids restricts the agent to only process audio from this user
    const session = agent.createSession({
      channel: channel_name,
      agentUid,
      remoteUids: [requester_id],
      idleTimeout: 30,
      expiresIn: ExpiresIn.seconds(MAX_SESSION_SECONDS),
      debug: false, // enable debug to show restful API calls in the console
    });

    const agentId = await session.start();

    // Proof this exact caller started this exact agent — required by
    // /api/stop-conversation so a guessed/observed agent_id can't be used to
    // stop someone else's session.
    const controlTicket = createTicket<AgentControlTicket>(
      { agentId, channel: channel_name },
      CONTROL_TICKET_TTL_SECONDS,
    );

    return NextResponse.json({
      agent_id: agentId,
      create_ts: Math.floor(Date.now() / 1000),
      state: 'RUNNING',
      control_ticket: controlTicket,
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
