'use client';

import { useState } from 'react';
import type { MemoryItem } from '@/lib/memory';

const SECTIONS: { kind: MemoryItem['kind']; title: string }[] = [
  { kind: 'misconception', title: 'Misconceptions' },
  { kind: 'strength', title: 'Strengths' },
  { kind: 'topic', title: 'Topics covered' },
];

export function MemoryList({ initial }: { initial: MemoryItem[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    else setError('Could not delete that item.');
  }

  async function forgetAll() {
    if (!window.confirm('Forget everything the tutor remembers about you? This cannot be undone.')) return;
    const res = await fetch('/api/memory', { method: 'DELETE' });
    if (res.ok) setItems([]);
    else setError('Could not clear memory.');
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing remembered yet. After each signed-in session, the tutor keeps short notes here so
        it can ask sharper questions next time.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {SECTIONS.map(({ kind, title }) => {
        const rows = items.filter((i) => i.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-foreground">{title}</h2>
            {rows.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/30 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {item.label}
                  {item.times_seen > 1 && <span className="text-xs"> · seen {item.times_seen}×</span>}
                </p>
                <button type="button" onClick={() => remove(item.id)} className="shrink-0 text-xs text-muted-foreground hover:text-destructive">
                  Forget
                </button>
              </div>
            ))}
          </section>
        );
      })}
      <button
        type="button"
        onClick={forgetAll}
        className="self-start rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        Forget everything
      </button>
    </div>
  );
}
