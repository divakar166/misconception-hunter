import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/account/LoginForm';
import { getCurrentUser, isAuthConfigured } from '@/lib/supabase/server';

export const metadata = { title: 'Sign in — Misconception Hunter' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect('/history');
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <Image src="/agora-logo-mark.svg" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          <span className="text-base font-semibold tracking-[-0.025em]">Misconception Hunter</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_10px_24px_rgba(0,0,0,0.08)] sm:p-8">
          {isAuthConfigured() ? (
            <>
              <h1 className="text-xl font-semibold">Welcome</h1>
              <p className="mb-6 mt-1 text-sm leading-6 text-muted-foreground">
                An account saves your sessions and lets the tutor remember what you&apos;ve worked on.
              </p>
              <LoginForm
                initialError={
                  error === 'confirmation_failed' ? 'That confirmation link is invalid or expired.' : undefined
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sign-in is not configured on this deployment.</p>
          )}
        </div>

        <Link
          href="/"
          className="mt-6 block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Continue as guest
        </Link>
      </div>
    </main>
  );
}
