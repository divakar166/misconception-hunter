// Session persistence — backs the /s/[id] shareable report permalink.
//
// Optional, same pattern as lib/rate-limit.ts: without SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY set, every function here is a no-op (persist
// returns null, get returns null). The app works fully without it — a
// session just isn't persisted or shareable, matching the pre-persistence
// behavior — so local dev and a from-scratch deploy don't require a
// database just to talk to the agent.
//
// Uses the service_role key, not the anon key: all access goes through
// server-side API routes, never the browser, so RLS is enabled on the table
// with no policies (denies the anon key entirely) and the service role
// bypasses it by design. See supabase/schema.sql.

import { randomBytes } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SessionSummaryResponse, SessionSummaryTurn } from '@/types/conversation';

export interface PersistedSession {
  id: string;
  created_at: string;
  topic: string | null;
  transcript: SessionSummaryTurn[];
  summary: SessionSummaryResponse;
}

function getClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key, { auth: { persistSession: false } });
  } catch (error) {
    console.error('[db] Invalid Supabase configuration, persistence disabled:', error);
    return null;
  }
}

const supabase = getClient();

/**
 * Short, random, URL-safe id for a session permalink (/s/<id>). Not
 * sequential and not derived from anything guessable, so permalinks can't
 * be enumerated — see supabase/schema.sql for the corresponding comment.
 */
function generateSessionId(): string {
  return randomBytes(9).toString('base64url'); // 12 chars, ~72 bits of entropy
}

/**
 * Persist a finished session (transcript + report) and return its public id,
 * or null if persistence isn't configured or the write failed — callers
 * should treat that as "no permalink available," not a fatal error, since
 * the session summary itself was already shown to the student regardless.
 */
export async function persistSession(
  transcript: SessionSummaryTurn[],
  summary: SessionSummaryResponse,
): Promise<string | null> {
  if (!supabase) return null;

  const id = generateSessionId();
  const { error } = await supabase.from('sessions').insert({
    id,
    topic: summary.topic || null,
    transcript,
    summary,
  });

  if (error) {
    console.error('[db] Failed to persist session:', error);
    return null;
  }

  return id;
}

/**
 * Fetch a persisted session by its public id, or null if persistence isn't
 * configured, the id doesn't exist, or the row is malformed.
 */
export async function getSession(id: string): Promise<PersistedSession | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('sessions')
    .select('id, created_at, topic, transcript, summary')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[db] Failed to fetch session:', error);
    return null;
  }

  return data as PersistedSession | null;
}
