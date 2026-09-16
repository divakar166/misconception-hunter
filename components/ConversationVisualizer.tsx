'use client';

import { Loader2, Mic, MicOff } from 'lucide-react';
import type { ILocalAudioTrack, IMicrophoneAudioTrack } from 'agora-rtc-react';

// Local replacements for agora-agent-uikit's AgentVisualizer and
// MicButtonWithVisualizer.
//
// Those two components resolved to `undefined` in a production build while
// working fine under `next dev` — dev runs webpack, `next build` runs
// Turbopack, and the UI kit's dual ESM/CJS output doesn't survive the
// production bundler's resolution intact. The result was React's "Element
// type is invalid" crash that took the entire conversation view down with
// it, even though RTC, RTM and the agent itself were all connected fine.
//
// Reimplementing them here removes the dependency from the critical render
// path entirely: these are presentational only (an agent-state indicator and
// a mic toggle), so owning them costs little and means a bundler-resolution
// quirk in a third-party package can't take down the whole call UI again.

export type VisualizerState =
  | 'disconnected'
  | 'joining'
  | 'not-joined'
  | 'listening'
  | 'analyzing'
  | 'talking'
  | 'ambient';

const STATE_LABEL: Record<VisualizerState, string> = {
  disconnected: 'Disconnected',
  joining: 'Connecting',
  'not-joined': 'Waiting for agent',
  listening: 'Listening',
  analyzing: 'Thinking',
  talking: 'Speaking',
  ambient: 'Ambient',
};

// Each state gets its own ring treatment so the agent's turn is readable at a
// glance without needing to read the label.
const STATE_RING: Record<VisualizerState, string> = {
  disconnected: 'border-destructive/40',
  joining: 'border-muted-foreground/40 animate-pulse',
  'not-joined': 'border-muted-foreground/40 animate-pulse',
  listening: 'border-primary shadow-[0_0_40px_-8px_hsl(var(--primary))]',
  analyzing: 'border-amber-400/70 animate-pulse',
  talking: 'border-primary shadow-[0_0_60px_-4px_hsl(var(--primary))] animate-pulse',
  ambient: 'border-border',
};

export function ConversationVisualizer({ state }: { state: VisualizerState }) {
  const isBusy = state === 'joining' || state === 'not-joined';

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        className={`flex h-40 w-40 items-center justify-center rounded-full border-2 transition-all duration-500 ${STATE_RING[state]}`}
      >
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-card/60">
          {isBusy ? (
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-sm font-medium text-foreground">
              {STATE_LABEL[state]}
            </span>
          )}
        </div>
      </div>
      {isBusy && (
        <span className="text-sm text-muted-foreground">{STATE_LABEL[state]}</span>
      )}
    </div>
  );
}

export function MicToggleButton({
  isEnabled,
  onToggle,
  track,
}: {
  isEnabled: boolean;
  onToggle: () => void;
  track?: IMicrophoneAudioTrack | ILocalAudioTrack | null;
}) {
  // No track yet means the mic hasn't been acquired — disable rather than
  // letting a click no-op silently.
  const isReady = Boolean(track);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!isReady}
      aria-label={isEnabled ? 'Mute microphone' : 'Unmute microphone'}
      aria-pressed={!isEnabled}
      title={isEnabled ? 'Mute microphone' : 'Unmute microphone'}
      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        isEnabled
          ? 'border-primary text-primary hover:bg-primary/10'
          : 'border-destructive text-destructive hover:bg-destructive/10'
      }`}
    >
      {isEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
    </button>
  );
}
