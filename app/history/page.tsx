import { redirect } from 'next/navigation';
import { AccountShell } from '@/components/account/AccountShell';
import { HistoryList } from '@/components/account/HistoryList';
import { listSessionsForUser } from '@/lib/db';
import { getCurrentUser } from '@/lib/supabase/server';

export const metadata = { title: 'Your sessions — Misconception Hunter' };
export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <AccountShell title="Your sessions" email={user.email}>
      <HistoryList initial={await listSessionsForUser(user.id)} />
    </AccountShell>
  );
}
