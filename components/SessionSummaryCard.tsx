'use client';

import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportBody } from '@/components/ReportBody';
import type { SessionSummaryResponse } from '@/types/conversation';

type SessionSummaryCardProps = {
  isLoading: boolean;
  error: string | null;
  summary: SessionSummaryResponse | null;
  // Public permalink id from /api/sessions, or null while pending / if
  // persistence isn't configured or failed — the share control just doesn't
  // render in that case, since there's nothing to share.
  shareId: string | null;
  onStartNewSession: () => void;
};

function ShareLink({ shareId }: { shareId: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/s/${shareId}` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy share link:', error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-background/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      aria-label="Copy shareable link to this report"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Link copied' : 'Copy shareable link'}
    </button>
  );
}

export function SessionSummaryCard({
  isLoading,
  error,
  summary,
  shareId,
  onStartNewSession,
}: SessionSummaryCardProps) {
  return (
    <div className="mx-auto flex w-[min(92vw,42rem)] animate-fade-up flex-col gap-6 rounded-[20px] border border-border bg-card/40 px-8 py-8 text-left shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Session Summary</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A structured look at how the conversation went.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating summary...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!isLoading && !error && summary && (
        <ReportBody
          summary={summary}
          aboveAssessment={shareId ? <ShareLink shareId={shareId} /> : undefined}
        />
      )}

      <Button
        onClick={onStartNewSession}
        className="mt-2 h-10 w-full rounded-lg border border-primary bg-primary text-sm font-medium text-black hover:border-white hover:bg-white hover:text-black"
      >
        Start New Session
      </Button>
    </div>
  );
}
