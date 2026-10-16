import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isAuthConfigured(): boolean {
  return Boolean(url() && anonKey());
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(url()!, anonKey()!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only; the
          // proxy refreshes the session on every request instead.
        }
      },
    },
  });
}

/**
 * The verified signed-in user's id, or null for guests, when auth isn't
 * configured, or outside a request scope. getUser() validates the JWT with
 * Supabase Auth rather than trusting the cookie contents.
 */
export async function getCurrentUser(): Promise<{ id: string; email: string | null } | null> {
  if (!isAuthConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
