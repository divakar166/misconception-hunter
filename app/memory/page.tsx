import { redirect } from 'next/navigation';
import { AccountShell } from '@/components/account/AccountShell';
import { MemoryList } from '@/components/account/MemoryList';
import { listMemory } from '@/lib/memory';
import { getCurrentUser } from '@/lib/supabase/server';

export const metadata = { title: 'Tutor memory — Misconception Hunter' };
export const dynamic = 'force-dynamic';

export default async function MemoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <AccountShell title="What the tutor remembers" email={user.email}>
      <p className="text-sm text-muted-foreground">
        Short notes from your past sessions, written by an automated summarizer. They shape the
        tutor&apos;s next questions. You can remove any of them, or all of them.
      </p>
      <MemoryList initial={await listMemory(user.id)} />
    </AccountShell>
  );
}
