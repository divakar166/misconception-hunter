'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionSummaryResponse } from '@/types/conversation';

type SessionSummaryCardProps = {
  isLoading: boolean;
  error: string | null;
  summary: SessionSummaryResponse | null;
  onStartNewSession: () => void;
};

const ASSESSMENT_LABEL: Record<SessionSummaryResponse['overallAssessment'], string> = {
  concept_understood: 'Concept understood',
  misconception_confirmed: 'Misconception found',
  insufficient_evidence: 'Not enough evidence yet',
};

const ASSESSMENT_STYLE: Record<SessionSummaryResponse['overallAssessment'], string> = {
  concept_understood: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  misconception_confirmed: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  insufficient_evidence: 'border-border bg-muted/30 text-muted-foreground',
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function SessionSummaryCard({
  isLoading,
  error,
  summary,
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
        <div className="flex flex-col gap-5">
          <Section title="Topic">
            <p className="text-sm text-foreground">{summary.topic || 'Not established'}</p>
          </Section>

          <div>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                ASSESSMENT_STYLE[summary.overallAssessment]
              }`}
            >
              {ASSESSMENT_LABEL[summary.overallAssessment]}
            </span>
          </div>

          {summary.escalation.recommended && (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-300">
              <p className="font-medium">Flagged for teacher review</p>
              {summary.escalation.reason && (
                <p className="mt-1 text-xs text-sky-300/80">
                  {summary.escalation.reason}
                </p>
              )}
            </div>
          )}

          {summary.misconceptions.length > 0 && (
            <Section title="Misconceptions">
              <div className="flex flex-col gap-3">
                {summary.misconceptions.map((finding, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-background/40 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-foreground">{finding.description}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {Math.round(finding.confidence * 100)}% confidence
                      </span>
                    </div>
                    {finding.evidence.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        {finding.evidence.map((line, evidenceIndex) => (
                          <li key={evidenceIndex}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {summary.strengths.length > 0 && (
            <Section title="Strengths">
              <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
                {summary.strengths.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </Section>
          )}

          {summary.recommendedNextSteps.length > 0 && (
            <Section title="Recommended next steps">
              <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
                {summary.recommendedNextSteps.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
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
