'use client';

import { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import type { RTMClient } from 'agora-rtm';
import type {
  AgoraTokenData,
  ClientStartRequest,
  AgentResponse,
  AgoraRenewalTokens,
  SessionSummaryTurn,
  SessionSummaryResponse,
} from '../types/conversation';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingSkeleton } from './LoadingSkeleton';
import { QuickstartPreCallCard } from './QuickstartPreCallCard';
import { SessionSummaryCard } from './SessionSummaryCard';

// Dynamically import the ConversationComponent with ssr disabled
const ConversationComponent = dynamic(() => import('./ConversationComponent'), {
  ssr: false,
});

// Dynamically import AgoraRTCProvider (browser-only).
// The AgoraVoiceAI toolkit is initialized inside ConversationComponent after
// the RTC join succeeds, so this wrapper only needs to provide the RTC client.
const AgoraProvider = dynamic(
  async () => {
    const { AgoraRTCProvider, default: AgoraRTC } =
      await import('agora-rtc-react');
    return {
      default: function AgoraProviders({
        children,
      }: {
        children: React.ReactNode;
      }) {
        // useRef persists across StrictMode's simulated unmount/remount, so only
        // one RTC client is ever created per session (useMemo creates two in StrictMode).
        const clientRef = useRef<ReturnType<
          typeof AgoraRTC.createClient
        > | null>(null);
        if (!clientRef.current) {
          clientRef.current = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8',
          });
        }
        return (
          <AgoraRTCProvider client={clientRef.current}>
            {children}
          </AgoraRTCProvider>
        );
      },
    };
  },
  { ssr: false },
);

type View = 'pre-call' | 'in-call' | 'summary';

export default function LandingPage() {
  const [view, setView] = useState<View>('pre-call');

  // Preload heavy modules on mount so they're already cached when the user
  // clicks "Try it Now" — eliminates the ~1.8s dynamic-import delay.
  useEffect(() => {
    import('agora-rtc-react').catch(() => {});
    import('agora-rtm').catch(() => {});
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // Populated (best-effort) once the finished session is persisted — see
  // /api/sessions. Stays null if persistence isn't configured or fails;
  // that's not an error state, the summary above is unaffected either way.
  const [shareId, setShareId] = useState<string | null>(null);
  const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
  const [agentJoinError, setAgentJoinError] = useState(false);

  const handleStartConversation = async (topic?: string) => {
    setIsLoading(true);
    setError(null);
    setAgentJoinError(false);

    try {
      // 1. Fetch RTC token + channel
      // console.log('Fetching Agora token...');
      const agoraResponse = await fetch('/api/generate-agora-token');
      const responseData = await agoraResponse.json();
      // console.log('Agora token response: uid =', responseData.uid, 'channel =', responseData.channel);

      if (!agoraResponse.ok) {
        throw new Error(
          `Failed to generate Agora token: ${JSON.stringify(responseData)}`,
        );
      }

      // 2. Run agent invite and RTM setup in parallel — both only need the token response.
      //    RTM must be ready before ConversationComponent mounts so AgoraVoiceAI
      //    can subscribe immediately. Agent invite is non-fatal.
      const [agentData, rtm] = await Promise.all([
        // 2a. Start the AI agent
        fetch('/api/invite-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket: responseData.ticket,
            ...(topic?.trim() && { topic: topic.trim() }),
          } as ClientStartRequest),
        })
          .then(async (res) => {
            if (!res.ok) {
              setAgentJoinError(true);
              return null;
            }
            return res.json() as Promise<AgentResponse>;
          })
          .catch((err) => {
            console.error('Failed to start conversation with agent:', err);
            setAgentJoinError(true);
            return null;
          }),

        // 2b. Set up RTM (dynamically imported to keep it client-only)
        (async () => {
          const { default: AgoraRTM } = await import('agora-rtm');
          const rtm: RTMClient = new AgoraRTM.RTM(
            process.env.NEXT_PUBLIC_AGORA_APP_ID!,
            responseData.uid,
          );
          await rtm.login({ token: responseData.token });
          await rtm.subscribe(responseData.channel);
          // console.log('RTM ready, channel:', responseData.channel);
          return rtm;
        })(),
      ]);

      // 3. All dependencies ready — store state and show conversation
      setRtmClient(rtm);
      setAgoraData({
        ...responseData,
        agentId: agentData?.agent_id,
        controlTicket: agentData?.control_ticket,
      });
      setSummary(null);
      setSummaryError(null);
      setView('in-call');
    } catch (err) {
      setError('Failed to start conversation. Please try again.');
      console.error('Error starting conversation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenWillExpire = useCallback(
    async (): Promise<AgoraRenewalTokens> => {
      try {
        const ticket = agoraData?.ticket;
        if (!ticket) {
          throw new Error('Missing session ticket for token renewal');
        }

        // Renewal is authorized by the session ticket, not a client-supplied
        // channel/uid (see lib/session-ticket.ts) — the server derives both
        // from the ticket, so this can only ever renew *this* session.
        //
        // One fetch, not two: per the "One Token Rule" (docs/ai/L1/L2/token_model.md),
        // a single buildTokenWithRtm token already carries both RTC and RTM
        // privilege for the same uid — this app always uses the same uid for
        // both (see components/ConversationComponent.tsx's useJoin call), so
        // there's nothing a second, near-identical fetch would add.
        const response = await fetch(`/api/generate-agora-token?ticket=${encodeURIComponent(ticket)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate renewal token');
        }

        // Roll the ticket forward so a session that renews more than once
        // keeps a fresh, non-expired ticket to renew with next time.
        setAgoraData((prev) => (prev ? { ...prev, ticket: data.ticket } : prev));

        return {
          rtcToken: data.token,
          rtmToken: data.token,
        };
      } catch (error) {
        console.error('Error renewing token:', error);
        throw error;
      }
    },
    [agoraData],
  );

  const handleEndConversation = async (transcript: SessionSummaryTurn[]) => {
    // Stop the AI agent
    if (agoraData?.agentId) {
      try {
        // console.log('Stopping agent:', agoraData.agentId);
        const response = await fetch('/api/stop-conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: agoraData.agentId,
            control_ticket: agoraData.controlTicket,
          }),
        });
        if (!response.ok) {
          console.error('Failed to stop agent:', await response.text());
        }
        // else console.log('Agent stopped successfully');
      } catch (error) {
        console.error('Error stopping agent:', error);
      }
    }

    // Tear down RTM — owned here since we created it here
    rtmClient?.logout().catch((err) => console.error('RTM logout error:', err));
    setRtmClient(null);
    setView('summary');

    // Structured learning outcome: generated once, after the call ends, from
    // the transcript the client already has — no live pipeline dependency.
    if (transcript.length === 0) {
      setSummaryError('The conversation was too short to summarize.');
      return;
    }

    setIsSummaryLoading(true);
    setSummaryError(null);
    setShareId(null);
    try {
      const response = await fetch('/api/session-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }
      const data = (await response.json()) as SessionSummaryResponse;
      setSummary(data);

      // Best-effort persistence for the shareable /s/[id] permalink — never
      // blocks or fails the summary the student already sees above.
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, summary: data }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => setShareId(body?.id ?? null))
        .catch((err) => console.error('Error persisting session:', err));
    } catch (err) {
      console.error('Error generating session summary:', err);
      setSummaryError('Could not generate a summary for this session.');
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleStartNewSession = () => {
    setAgoraData(null);
    setSummary(null);
    setSummaryError(null);
    setShareId(null);
    setView('pre-call');
  };

  return (
    <div className="relative flex h-dvh min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Hero shell: pre-call CTA, live conversation, or the post-call summary. */}
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          view === 'in-call'
            ? 'items-stretch justify-start overflow-hidden'
            : 'items-center justify-start overflow-y-auto py-10'
        }`}
      >
        <div
          className={`z-10 flex min-h-0 flex-1 flex-col ${
            view === 'in-call'
              ? 'h-full w-full max-w-none items-stretch gap-0 px-0 text-left'
              : 'w-full max-w-none items-center justify-start px-4 text-center'
          }`}
        >
          {view === 'pre-call' && (
            <QuickstartPreCallCard
              isLoading={isLoading}
              error={error}
              onStartConversation={handleStartConversation}
            />
          )}

          {view === 'summary' && (
            <SessionSummaryCard
              isLoading={isSummaryLoading}
              error={summaryError}
              summary={summary}
              shareId={shareId}
              onStartNewSession={handleStartNewSession}
            />
          )}

          {view === 'in-call' &&
            (agoraData && rtmClient ? (
              <>
                {/* Non-fatal invite warning: the browser session can still render even if agent start failed. */}
                {agentJoinError && (
                  <div className="p-3 bg-destructive/10 rounded-md text-destructive text-sm max-w-sm">
                    Failed to connect with AI agent. The conversation may not
                    work as expected.
                  </div>
                )}
                {/* Browser-only conversation mount: RTC provider, error boundary, and lazy-loaded call UI. */}
                <Suspense fallback={<LoadingSkeleton />}>
                  <ErrorBoundary>
                    <AgoraProvider>
                      <ConversationComponent
                        agoraData={agoraData}
                        rtmClient={rtmClient}
                        onTokenWillExpire={handleTokenWillExpire}
                        onEndConversation={handleEndConversation}
                      />
                    </AgoraProvider>
                  </ErrorBoundary>
                </Suspense>
              </>
            ) : (
              /* Fallback if session bootstrap partially succeeded but required state is missing. */
              <p className="text-sm text-muted-foreground">
                Failed to load conversation data.
              </p>
            ))}
        </div>
      </div>

      {/* Persistent attribution footer for the pre-call and in-call views. */}
      <footer className="fixed bottom-0 right-0 z-40 py-4 pr-4 md:py-6 md:pr-6">
        <div className="flex items-center justify-end gap-2 text-muted-foreground">
          <span className="text-xs font-medium tracking-wide uppercase">
            Powered by
          </span>
          <a
            href="https://agora.io/en/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
            aria-label="Visit Agora's website"
          >
            <Image
              src="/agora-logo-rgb-blue.svg"
              alt="Agora"
              width={86}
              height={24}
              priority
              className="h-6 w-auto hover:opacity-80 transition-opacity translate-y-1"
            />
            <span className="sr-only">Agora</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
