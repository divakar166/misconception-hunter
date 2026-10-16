'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SessionListItem } from '@/lib/db';

const ASSESSMENT_LABEL: Record<string, string> = {
  concept_understood: 'Concept understood',
  misconception_confirmed: 'Misconception confirmed',
  insufficient_evidence: 'Insufficient evidence',
};

export function HistoryList({ initial }: { initial: SessionListItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm('Delete this session and its report? Its share link will stop working.')) return;
    const res = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    else setError('Could not delete that session.');
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved sessions yet. Finish a session while signed in and it will show up here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/30 px-4 py-3">
          <Link href={`/s/${item.id}`} className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{item.topic || 'Untitled session'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              {item.overallAssessment && ` · ${ASSESSMENT_LABEL[item.overallAssessment] ?? item.overallAssessment}`}
              {item.misconceptionCount > 0 &&
                ` · ${item.misconceptionCount} misconception${item.misconceptionCount > 1 ? 's' : ''}`}
            </p>
          </Link>
          <button type="button" onClick={() => remove(item.id)} className="text-xs text-muted-foreground hover:text-destructive">
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
