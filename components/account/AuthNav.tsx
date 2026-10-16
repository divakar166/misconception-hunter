'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { SignOutButton } from './SignOutButton';

const linkClass =
  'rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:border-primary hover:text-foreground';

// Top-right sign-in / account links for the landing page. Renders nothing when
// Supabase Auth isn't configured, so the app still works without it.
export function AuthNav() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  if (email === undefined) return null;

  return (
    <nav className="fixed right-4 top-4 z-40 flex items-center gap-2 md:right-6 md:top-6">
      {email ? (
        <>
          <Link href="/history" className={linkClass}>History</Link>
          <Link href="/memory" className={linkClass}>Memory</Link>
          <SignOutButton className={linkClass} />
        </>
      ) : (
        <Link href="/login" className={linkClass}>Sign in</Link>
      )}
    </nav>
  );
}
