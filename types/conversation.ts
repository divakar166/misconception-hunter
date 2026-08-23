import type { RTMClient } from 'agora-rtm';

export interface AgoraTokenData {
  token: string;
  uid: string;
  channel: string;
  agentId?: string;
}

export interface ClientStartRequest {
  requester_id: string;
  channel_name: string;
  // Optional: student-supplied or LLM-suggested topic to open the session
  // on, instead of a randomly picked starter question.
  topic?: string;
}

export interface SuggestTopicResponse {
  topic: string;
}

export interface StopConversationRequest {
  agent_id: string;
}

export interface AgentResponse {
  agent_id: string;
  create_ts: number;
  state: string;
}

export interface AgoraRenewalTokens {
  rtcToken: string;
  rtmToken: string;
}

export interface ConversationComponentProps {
  agoraData: AgoraTokenData;
  rtmClient: RTMClient;
  onTokenWillExpire: (uid: string) => Promise<AgoraRenewalTokens>;
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
