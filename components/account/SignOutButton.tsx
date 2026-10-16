'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await createSupabaseBrowserClient()?.auth.signOut();
        router.push('/');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
