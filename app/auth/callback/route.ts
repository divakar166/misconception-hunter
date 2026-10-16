import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, isAuthConfigured } from '@/lib/supabase/server';

// Landing point for the email-confirmation link: exchanges the one-time code
// for a session cookie, then sends the user on.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/history';

  if (code && isAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
