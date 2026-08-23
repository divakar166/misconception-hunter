'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SuggestTopicResponse } from '@/types/conversation';

type QuickstartPreCallCardProps = {
  isLoading: boolean;
  error: string | null;
  onStartConversation: (topic?: string) => void;
};

const HOW_IT_WORKS = [
  'You get a loaded question — not "pick a topic."',
  'Explain your reasoning out loud, not just your answer.',
  'Walk away with a report: what you got right, what to revisit.',
];

export function QuickstartPreCallCard({
  isLoading,
  error,
  onStartConversation,
}: QuickstartPreCallCardProps) {
  const [topic, setTopic] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const handleSuggestTopic = async () => {
    setIsSuggesting(true);
    setSuggestError(null);
    try {
      const response = await fetch('/api/suggest-topic', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to suggest a topic');
      }
      const data = (await response.json()) as SuggestTopicResponse;
      setTopic(data.topic);
    } catch (err) {
      console.error('Error suggesting topic:', err);
      setSuggestError('Could not get a suggestion — try again, or type your own.');
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div
      className="mx-auto flex w-[min(92vw,28rem)] animate-fade-up flex-col items-center rounded-[20px] border border-[#2b2b2b] px-10 py-10 text-center shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
      style={{
        backgroundImage:
          'linear-gradient(164.988deg, rgba(54,54,54,0.2) 1.0596%, rgba(0,0,0,0) 96.089%), linear-gradient(90deg, rgb(16,16,16) 0%, rgb(16,16,16) 100%)',
      }}
    >
      <span className="rounded-full border border-[#2f2f2f] bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Misconception Hunter
      </span>

      <h1 className="mt-4 text-[28px] font-medium leading-[1.2] text-white">
        It&apos;s not testing your answer. It&apos;s testing how you think.
      </h1>
      <p className="mt-[14px] text-sm font-medium leading-6 text-muted-foreground">
        A voice-native Socratic tutor that investigates your reasoning out
        loud, and never calls out a misconception until it has real
        evidence — not just one wrong answer.
      </p>

      <ul className="mt-6 flex w-full flex-col gap-2 text-left">
        {HOW_IT_WORKS.map((line, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"
          >
            <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/50 text-[10px] font-semibold text-primary">
              {index + 1}
            </span>
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-6 w-full text-left">
        <label
          htmlFor="topic-input"
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Pick a topic (optional)
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="topic-input"
            type="text"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. recursion, overfitting, Big-O..."
            disabled={isLoading}
            className="h-10 flex-1 rounded-lg border border-[#2f2f2f] bg-black/30 px-3 text-sm text-white placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleSuggestTopic}
            disabled={isLoading || isSuggesting}
            className="h-10 w-10 shrink-0 border-[#2f2f2f] bg-transparent text-muted-foreground hover:text-primary"
            aria-label="Suggest a topic"
            title="Suggest a topic"
          >
            {isSuggesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        </div>
        {suggestError && (
          <p className="mt-2 text-xs text-destructive">{suggestError}</p>
        )}
      </div>

      <Button
        onClick={() => onStartConversation(topic)}
        disabled={isLoading}
        className="mt-6 h-10 w-full rounded-lg border border-primary bg-primary text-sm font-medium text-black hover:border-white hover:bg-white hover:text-black disabled:hover:border-primary disabled:hover:bg-primary disabled:hover:text-black"
        aria-label={
          isLoading
            ? 'Starting conversation with AI agent'
            : 'Start conversation with AI agent'
        }
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting...
          </>
        ) : (
          'Start Conversation'
        )}
      </Button>
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <p className="mt-6 text-[11px] text-muted-foreground/70">
        Voice powered by Agora Conversational AI
      </p>
    </div>
  );
}
