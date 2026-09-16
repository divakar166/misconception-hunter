import { AgoraClient, Agent } from 'agora-agents';
import { RtcTokenBuilder } from 'agora-token';
import { NextRequest } from 'next/server';
import { createTicket } from '../lib/session-ticket';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

process.env.NEXT_PUBLIC_AGORA_APP_ID = '0123456789abcdef0123456789abcdef';
process.env.NEXT_AGORA_APP_CERTIFICATE = 'fedcba9876543210fedcba9876543210';

async function verifyGenerateAgoraTokenInitialMint() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const originalBuildTokenWithRtm = RtcTokenBuilder.buildTokenWithRtm;
  let tokenBuilderArgs: unknown[] | null = null;

  RtcTokenBuilder.buildTokenWithRtm = ((...args: unknown[]) => {
    tokenBuilderArgs = args;
    return 'mock-rtc-rtm-token';
  }) as typeof RtcTokenBuilder.buildTokenWithRtm;

  try {
    // No `ticket` -> a fresh session: channel and uid must be server-generated,
    // never trusted from the caller.
    const request = new NextRequest('http://localhost:3000/api/generate-agora-token');
    const response = await generateAgoraToken(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'GET /api/generate-agora-token should return 200',
    );
    assert(
      body.token === 'mock-rtc-rtm-token',
      'GET /api/generate-agora-token should return the built token',
    );
    assert(
      typeof body.uid === 'string' && body.uid !== '0' && Number(body.uid) > 0,
      'GET /api/generate-agora-token should generate an RTM-safe, non-zero uid',
    );
    assert(
      typeof body.channel === 'string' && body.channel.startsWith('ai-conversation-'),
      'GET /api/generate-agora-token should generate a channel name',
    );
    assert(
      typeof body.ticket === 'string' && body.ticket.includes('.'),
      'GET /api/generate-agora-token should return a signed session ticket',
    );
    assert(
      Array.isArray(tokenBuilderArgs) &&
        tokenBuilderArgs[2] === body.channel &&
        tokenBuilderArgs[3] === body.uid,
      'buildTokenWithRtm should be called with the generated channel/uid',
    );
  } finally {
    RtcTokenBuilder.buildTokenWithRtm = originalBuildTokenWithRtm;
  }
}

async function verifyGenerateAgoraTokenIgnoresQueryOverride() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const originalBuildTokenWithRtm = RtcTokenBuilder.buildTokenWithRtm;
  RtcTokenBuilder.buildTokenWithRtm = (() => 'mock-rtc-rtm-token') as typeof RtcTokenBuilder.buildTokenWithRtm;

  try {
    // Regression guard for the fixed vulnerability: without a valid `ticket`,
    // a caller-supplied channel/uid must be ignored, not used to mint a token
    // for a channel the caller doesn't own.
    const request = new NextRequest(
      'http://localhost:3000/api/generate-agora-token?uid=4321&channel=someone-elses-channel',
    );
    const response = await generateAgoraToken(request);
    const body = await getJson(response);

    assert(response.status === 200, 'GET /api/generate-agora-token should still return 200');
    assert(
      body.channel !== 'someone-elses-channel',
      'GET /api/generate-agora-token must not mint a token for a caller-supplied channel',
    );
    assert(
      body.uid !== '4321',
      'GET /api/generate-agora-token must not mint a token for a caller-supplied uid',
    );
  } finally {
    RtcTokenBuilder.buildTokenWithRtm = originalBuildTokenWithRtm;
  }
}

async function verifyGenerateAgoraTokenRenewsWithValidTicket() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const originalBuildTokenWithRtm = RtcTokenBuilder.buildTokenWithRtm;
  let tokenBuilderArgs: unknown[] | null = null;
  RtcTokenBuilder.buildTokenWithRtm = ((...args: unknown[]) => {
    tokenBuilderArgs = args;
    return 'mock-rtc-rtm-token';
  }) as typeof RtcTokenBuilder.buildTokenWithRtm;

  try {
    const ticket = createTicket({ channel: 'existing-channel', uid: '7777' });
    const request = new NextRequest(
      `http://localhost:3000/api/generate-agora-token?ticket=${encodeURIComponent(ticket)}`,
    );
    const response = await generateAgoraToken(request);
    const body = await getJson(response);

    assert(response.status === 200, 'GET .../generate-agora-token with a valid ticket should return 200');
    assert(
      body.channel === 'existing-channel' && body.uid === '7777',
      'GET .../generate-agora-token with a valid ticket should renew for that ticket\'s channel/uid',
    );
    assert(
      Array.isArray(tokenBuilderArgs) &&
        tokenBuilderArgs[2] === 'existing-channel' &&
        tokenBuilderArgs[3] === '7777',
      'buildTokenWithRtm should be called with the ticket\'s channel/uid',
    );
    assert(
      typeof body.ticket === 'string' && body.ticket.includes('.'),
      'a fresh ticket should be issued on renewal so the chain can continue',
    );
  } finally {
    RtcTokenBuilder.buildTokenWithRtm = originalBuildTokenWithRtm;
  }
}

async function verifyGenerateAgoraTokenRejectsInvalidTicket() {
  const { GET: generateAgoraToken } =
    await import('../app/api/generate-agora-token/route');
  const request = new NextRequest(
    'http://localhost:3000/api/generate-agora-token?ticket=not-a-real-ticket',
  );
  const response = await generateAgoraToken(request);
  const body = await getJson(response);

  assert(response.status === 401, 'GET .../generate-agora-token with a bad ticket should return 401');
  assert(
    body.error === 'Invalid or expired session ticket',
    'GET .../generate-agora-token should explain the invalid ticket',
  );
}

async function verifyChatCompletionsMissingEnv() {
  const { createChatCompletionsHandler } =
    await import('../app/api/chat/completions/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;

  delete process.env.NEXT_LLM_API_KEY;
  delete process.env.NEXT_LLM_URL;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called when env is missing');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called when env is missing');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({ messages: [] }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 500,
      'POST /api/chat/completions should reject missing LLM env',
    );
    assert(
      body.error === 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set',
      'POST /api/chat/completions should explain missing LLM env',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsInvalidJson() {
  const { createChatCompletionsHandler } =
    await import('../app/api/chat/completions/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  const handler = createChatCompletionsHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called for invalid JSON');
    }) as never,
    streamTextImpl: (() => {
      throw new Error('streamText should not be called for invalid JSON');
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: '{not json',
        method: 'POST',
      },
    );
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 400,
      'POST /api/chat/completions should reject invalid JSON',
    );
    assert(
      body.error === 'Invalid JSON body',
      'POST /api/chat/completions should explain invalid JSON',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyChatCompletionsSseDone() {
  const { createChatCompletionsHandler } =
    await import('../app/api/chat/completions/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  let capturedBaseUrl: string | undefined;
  let capturedModelId: string | undefined;
  let capturedMessages: unknown;

  const handler = createChatCompletionsHandler({
    createOpenAIClient: ((options: { baseURL?: string }) => {
      capturedBaseUrl = options.baseURL;
      return (modelId: string) => {
        capturedModelId = modelId;
        return { modelId };
      };
    }) as never,
    streamTextImpl: ((options: { messages?: unknown }) => {
      capturedMessages = options.messages;
      return {
        textStream: (async function* () {
          yield 'hello';
          yield ' world';
        })(),
      };
    }) as never,
  });

  try {
    const request = new NextRequest(
      'http://localhost:3000/api/chat/completions',
      {
        body: JSON.stringify({
          model: 'caller-model-ignored-for-routing',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        method: 'POST',
      },
    );
    const response = await handler(request);
    const text = await response.text();

    assert(
      response.status === 200,
      'POST /api/chat/completions should return 200 for a valid request',
    );
    assert(
      response.headers.get('content-type') === 'text/event-stream',
      'POST /api/chat/completions should return SSE content type',
    );
    assert(
      capturedBaseUrl === 'https://example.test/v1',
      'POST /api/chat/completions should pass base URL without /chat/completions',
    );
    assert(
      capturedModelId === 'gpt-4o',
      'POST /api/chat/completions should route to the pinned server model',
    );
    assert(
      JSON.stringify(capturedMessages) ===
        JSON.stringify([{ role: 'user', content: 'Hi' }]),
      'POST /api/chat/completions should pass request messages to streamText',
    );
    assert(
      text.includes('data: [DONE]'),
      'POST /api/chat/completions should terminate with [DONE]',
    );
    assert(
      text.includes('"content":"hello"') && text.includes('"content":" world"'),
      'POST /api/chat/completions should stream text chunks as OpenAI-compatible deltas',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifySessionSummaryValidation() {
  const { createSessionSummaryHandler } =
    await import('../app/api/session-summary/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  const handler = createSessionSummaryHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called for an empty transcript');
    }) as never,
    generateObjectImpl: (() => {
      throw new Error('generateObject should not be called for an empty transcript');
    }) as never,
  });

  try {
    const request = new NextRequest('http://localhost:3000/api/session-summary', {
      body: JSON.stringify({ transcript: [] }),
      method: 'POST',
    });
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 400,
      'POST /api/session-summary should reject an empty transcript',
    );
    assert(
      body.error === 'transcript is required and must be a non-empty array',
      'POST /api/session-summary should explain the validation failure',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifySessionSummaryMissingEnv() {
  const { createSessionSummaryHandler } =
    await import('../app/api/session-summary/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  delete process.env.NEXT_LLM_API_KEY;
  delete process.env.NEXT_LLM_URL;

  const handler = createSessionSummaryHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called when env is missing');
    }) as never,
    generateObjectImpl: (() => {
      throw new Error('generateObject should not be called when env is missing');
    }) as never,
  });

  try {
    const request = new NextRequest('http://localhost:3000/api/session-summary', {
      body: JSON.stringify({
        transcript: [{ role: 'user', text: 'The truck pushes harder.' }],
      }),
      method: 'POST',
    });
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 500,
      'POST /api/session-summary should reject missing LLM env',
    );
    assert(
      body.error === 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set',
      'POST /api/session-summary should explain missing LLM env',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifySessionSummarySuccess() {
  const { createSessionSummaryHandler } =
    await import('../app/api/session-summary/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  let capturedBaseUrl: string | undefined;
  let capturedModelId: string | undefined;
  let capturedPrompt: unknown;

  const mockSummary = {
    topic: "Newton's third law",
    overallAssessment: 'insufficient_evidence',
    misconceptions: [],
    strengths: ['Correctly identified the two forces involved'],
    recommendedNextSteps: ['Revisit force pairs with unequal masses'],
    escalation: { recommended: false, reason: '' },
  };

  const handler = createSessionSummaryHandler({
    createOpenAIClient: ((options: { baseURL?: string }) => {
      capturedBaseUrl = options.baseURL;
      const model = (modelId: string) => {
        capturedModelId = modelId;
        return { modelId };
      };
      model.chat = model;
      return model;
    }) as never,
    generateObjectImpl: ((options: { prompt?: unknown }) => {
      capturedPrompt = options.prompt;
      return { object: mockSummary };
    }) as never,
  });

  try {
    const request = new NextRequest('http://localhost:3000/api/session-summary', {
      body: JSON.stringify({
        transcript: [
          { role: 'user', text: 'The truck pushes harder than the car.' },
          { role: 'assistant', text: 'What makes you think that?' },
        ],
      }),
      method: 'POST',
    });
    const response = await handler(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/session-summary should return 200 on success',
    );
    assert(
      JSON.stringify(body) === JSON.stringify(mockSummary),
      'POST /api/session-summary should return the generated summary',
    );
    assert(
      capturedBaseUrl === 'https://example.test/v1',
      'POST /api/session-summary should pass base URL without /chat/completions',
    );
    assert(
      capturedModelId === 'openai/gpt-oss-120b',
      'POST /api/session-summary should route to the pinned server model',
    );
    assert(
      typeof capturedPrompt === 'string' &&
        (capturedPrompt as string).includes('Student: The truck pushes harder') &&
        (capturedPrompt as string).includes('Tutor: What makes you think that?'),
      'POST /api/session-summary should format the transcript into the prompt',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifySuggestTopicMissingEnv() {
  const { createSuggestTopicHandler } =
    await import('../app/api/suggest-topic/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  delete process.env.NEXT_LLM_API_KEY;
  delete process.env.NEXT_LLM_URL;

  const handler = createSuggestTopicHandler({
    createOpenAIClient: (() => {
      throw new Error('createOpenAI should not be called when env is missing');
    }) as never,
    generateTextImpl: (() => {
      throw new Error('generateText should not be called when env is missing');
    }) as never,
  });

  try {
    const response = await handler(
      new NextRequest('http://localhost:3000/api/suggest-topic', { method: 'POST' }),
    );
    const body = await getJson(response);

    assert(
      response.status === 500,
      'POST /api/suggest-topic should reject missing LLM env',
    );
    assert(
      body.error === 'NEXT_LLM_API_KEY and NEXT_LLM_URL must be set',
      'POST /api/suggest-topic should explain missing LLM env',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifySuggestTopicSuccess() {
  const { createSuggestTopicHandler } =
    await import('../app/api/suggest-topic/route');
  const originalApiKey = process.env.NEXT_LLM_API_KEY;
  const originalUrl = process.env.NEXT_LLM_URL;
  process.env.NEXT_LLM_API_KEY = 'test-key';
  process.env.NEXT_LLM_URL = 'https://example.test/v1/chat/completions';

  let capturedModelId: string | undefined;

  const handler = createSuggestTopicHandler({
    createOpenAIClient: (() => {
      const model = (modelId: string) => {
        capturedModelId = modelId;
        return { modelId };
      };
      model.chat = model;
      return model;
    }) as never,
    generateTextImpl: (() => ({
      text: '"Does more training data always reduce bias?"',
    })) as never,
  });

  try {
    const response = await handler(
      new NextRequest('http://localhost:3000/api/suggest-topic', { method: 'POST' }),
    );
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/suggest-topic should return 200 on success',
    );
    assert(
      body.topic === 'Does more training data always reduce bias?',
      'POST /api/suggest-topic should return the trimmed, unquoted suggestion',
    );
    assert(
      capturedModelId === 'openai/gpt-oss-120b',
      'POST /api/suggest-topic should route to the pinned server model',
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.NEXT_LLM_API_KEY;
    } else {
      process.env.NEXT_LLM_API_KEY = originalApiKey;
    }
    if (originalUrl === undefined) {
      delete process.env.NEXT_LLM_URL;
    } else {
      process.env.NEXT_LLM_URL = originalUrl;
    }
  }
}

async function verifyInviteAgentValidation() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const request = new NextRequest('http://localhost:3000/api/invite-agent', {
    body: JSON.stringify({}),
    method: 'POST',
  });
  const response = await inviteAgent(request);
  const body = await getJson(response);

  assert(
    response.status === 401,
    'POST /api/invite-agent should reject a missing session ticket',
  );
  assert(
    body.error === 'Invalid or expired session ticket',
    'POST /api/invite-agent should explain the missing/invalid ticket',
  );
}

async function verifyInviteAgentSuccess() {
  const { POST: inviteAgent } = await import('../app/api/invite-agent/route');
  const originalCreateSession = Agent.prototype.createSession;
  let capturedSessionConfig: {
    channel?: string;
    agentUid?: string;
    remoteUids?: string[];
  } | null = null;

  Agent.prototype.createSession = ((sessionConfig: unknown) => {
    capturedSessionConfig = sessionConfig as {
      channel?: string;
      agentUid?: string;
      remoteUids?: string[];
    };
    return {
      start: async () => 'mock-agent-id',
    };
  }) as unknown as typeof Agent.prototype.createSession;

  try {
    const ticket = createTicket({ channel: 'test-channel', uid: 'user-4321' });
    const request = new NextRequest('http://localhost:3000/api/invite-agent', {
      body: JSON.stringify({ ticket }),
      method: 'POST',
    });
    const response = await inviteAgent(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/invite-agent should return 200 on success',
    );
    assert(
      body.agent_id === 'mock-agent-id',
      'POST /api/invite-agent should return the started agent id',
    );
    assert(
      body.state === 'RUNNING',
      'POST /api/invite-agent should return RUNNING state',
    );
    assert(
      typeof body.control_ticket === 'string' && body.control_ticket.includes('.'),
      'POST /api/invite-agent should return a signed control ticket for stop-conversation',
    );
    assert(
      capturedSessionConfig !== null,
      'POST /api/invite-agent should call createSession',
    );
    const sessionConfig = capturedSessionConfig as {
      channel?: string;
      agentUid?: string;
      remoteUids?: string[];
    };

    assert(
      sessionConfig.channel === 'test-channel',
      'POST /api/invite-agent should derive the channel from the session ticket',
    );
    assert(
      sessionConfig.agentUid === '123456',
      'POST /api/invite-agent should use the shared default agent UID',
    );
    assert(
      JSON.stringify(sessionConfig.remoteUids) ===
        JSON.stringify(['user-4321']),
      'POST /api/invite-agent should scope the session to the ticket\'s uid',
    );
  } finally {
    Agent.prototype.createSession = originalCreateSession;
  }
}

async function verifyStopConversationValidation() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const request = new NextRequest(
    'http://localhost:3000/api/stop-conversation',
    {
      body: JSON.stringify({}),
      method: 'POST',
    },
  );
  const response = await stopConversation(request);
  const body = await getJson(response);

  assert(
    response.status === 400,
    'POST /api/stop-conversation should reject missing agent_id',
  );
  assert(
    body.error === 'agent_id is required',
    'POST /api/stop-conversation should explain validation failure',
  );
}

async function verifyStopConversationRejectsMismatchedControlTicket() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');

  // Regression guard for the fixed vulnerability: a bare agent_id (no ticket,
  // or a ticket minted for a *different* agent_id) must not be enough to stop
  // a session — otherwise a guessed/observed agent_id lets anyone kill it.
  const ticketForAnotherAgent = createTicket({ agentId: 'someone-elses-agent-id', channel: 'c' });
  const request = new NextRequest(
    'http://localhost:3000/api/stop-conversation',
    {
      body: JSON.stringify({
        agent_id: 'mock-agent-id',
        control_ticket: ticketForAnotherAgent,
      }),
      method: 'POST',
    },
  );
  const response = await stopConversation(request);
  const body = await getJson(response);

  assert(
    response.status === 401,
    'POST /api/stop-conversation should reject a control ticket for a different agent_id',
  );
  assert(
    body.error === 'Invalid or expired control ticket for this agent',
    'POST /api/stop-conversation should explain the ticket/agent mismatch',
  );
}

async function verifyStopConversationSuccess() {
  const { POST: stopConversation } =
    await import('../app/api/stop-conversation/route');
  const originalStopAgent = AgoraClient.prototype.stopAgent;
  let stoppedAgentId: string | null = null;

  AgoraClient.prototype.stopAgent = async function (
    this: AgoraClient,
    agentId: string,
  ) {
    stoppedAgentId = agentId;
  } as typeof AgoraClient.prototype.stopAgent;

  try {
    const controlTicket = createTicket({ agentId: 'mock-agent-id', channel: 'test-channel' });
    const request = new NextRequest(
      'http://localhost:3000/api/stop-conversation',
      {
        body: JSON.stringify({ agent_id: 'mock-agent-id', control_ticket: controlTicket }),
        method: 'POST',
      },
    );
    const response = await stopConversation(request);
    const body = await getJson(response);

    assert(
      response.status === 200,
      'POST /api/stop-conversation should return 200 on success',
    );
    assert(
      body.success === true,
      'POST /api/stop-conversation should return success',
    );
    assert(
      stoppedAgentId === 'mock-agent-id',
      'POST /api/stop-conversation should call stopAgent with the requested agent id',
    );
  } finally {
    AgoraClient.prototype.stopAgent = originalStopAgent;
  }
}

async function main() {
  await verifyGenerateAgoraTokenInitialMint();
  await verifyGenerateAgoraTokenIgnoresQueryOverride();
  await verifyGenerateAgoraTokenRenewsWithValidTicket();
  await verifyGenerateAgoraTokenRejectsInvalidTicket();
  await verifyChatCompletionsMissingEnv();
  await verifyChatCompletionsInvalidJson();
  await verifyChatCompletionsSseDone();
  await verifySessionSummaryValidation();
  await verifySessionSummaryMissingEnv();
  await verifySessionSummarySuccess();
  await verifySuggestTopicMissingEnv();
  await verifySuggestTopicSuccess();
  await verifyInviteAgentValidation();
  await verifyInviteAgentSuccess();
  await verifyStopConversationValidation();
  await verifyStopConversationRejectsMismatchedControlTicket();
  await verifyStopConversationSuccess();

  console.log('API contract checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
