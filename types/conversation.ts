import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  // Signed proof of this exact (channel, uid) session — see lib/session-ticket.ts.
  // Required on renewal and to start/stop the agent; the server never trusts
  // a bare channel/uid/agent_id from the client without one.
  ticket: string;
  agentId?: string;
  // Proof of ownership of `agentId` — see AgentResponse.control_ticket.
  controlTicket?: string;
}

export interface ClientStartRequest {
  // The session ticket from /api/generate-agora-token. The server derives
  // channel and requester uid from this rather than trusting client-supplied
  // values — see lib/session-ticket.ts for why.
  ticket: string;
  // Optional: student-supplied or LLM-suggested topic to open the session
  // on, instead of a randomly picked starter question.
  topic?: string;
}

export interface SuggestTopicResponse {
  topic: string;
}

export interface StopConversationRequest {
  agent_id: string;
  // Proof this caller is the one who started this agent — see
  // lib/session-ticket.ts and AgentResponse.control_ticket.
  control_ticket: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
  // Signed {agentId, channel} ticket; must be presented back to
  // /api/stop-conversation to stop this specific agent.
  control_ticket: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: () => Promise<AgoraRenewalTokens>;
  onEndConversation: (transcript: SessionSummaryTurn[]) => void;
}

// A single conversation turn as sent to /api/session-summary. Built by the
// client from the transcript it already has (see lib/conversation.ts's
// getMessageList) — the server never sees the live call, only this transcript.
export interface SessionSummaryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface SessionSummaryRequest {
  transcript: SessionSummaryTurn[];
}

export interface MisconceptionFinding {
  description: string;
  confidence: number; // 0-1
  evidence: string[];
}

// Human escalation path (mandatory requirement): whether this session should
// be flagged for a teacher to review, and why.
export interface SessionEscalation {
  recommended: boolean;
  reason: string; // '' when not recommended
}

// The structured learning outcome produced at the end of a session — the
// product's "external action / structured outcome" for this track.
export interface SessionSummaryResponse {
  topic: string;
  overallAssessment:
    | 'concept_understood'
    | 'misconception_confirmed'
    | 'insufficient_evidence';
  misconceptions: MisconceptionFinding[];
  strengths: string[];
  recommendedNextSteps: string[];
  escalation: SessionEscalation;
}
