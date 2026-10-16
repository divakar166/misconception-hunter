'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type Mode = 'sign-in' | 'sign-up';

const TABS: { mode: Mode; label: string }[] = [
  { mode: 'sign-in', label: 'Sign in' },
  { mode: 'sign-up', label: 'Create account' },
];

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40';

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetFields() {
    setEmail('');
    setPassword('');
    setShowPassword(false);
  }

  // Switching between sign-in and sign-up always starts from a clean form.
  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    resetFields();
    setError(null);
    setNotice(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError('Sign-in is not configured on this deployment.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.push('/history');
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
      else if (data.session) {
        router.push('/history');
        router.refresh();
      } else {
        // Account created, awaiting email confirmation: back to a clean sign-in.
        setMode('sign-in');
        resetFields();
        setNotice('Check your email for a confirmation link, then sign in.');
      }
    }
    setBusy(false);
  }

  const isSignIn = mode === 'sign-in';

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={mode === tab.mode}
            onClick={() => switchMode(tab.mode)}
            className={`h-9 rounded-md text-sm font-medium transition-colors ${
              mode === tab.mode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* key remounts the form on mode change so browser autofill can't leak across modes. */}
      <form key={mode} onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              placeholder={isSignIn ? 'Your password' : 'At least 6 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground"
          >
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
