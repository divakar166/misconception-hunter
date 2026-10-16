import { NextRequest, NextResponse } from 'next/server';
import type { PersistSessionRequest, PersistSessionResponse } from '@/types/conversation';
import { deleteSessionForUser, persistSession } from '@/lib/db';
import { recordSessionMemory } from '@/lib/memory';
import { getCurrentUser } from '@/lib/supabase/server';
import { getClientIp, llmRouteLimiter } from '@/lib/rate-limit';

// Persists a finished session (transcript + report) so it can be shared via
// /s/[id]. Called from the client right after the summary is generated and
// shown — this is a best-effort save, not part of the summary flow itself:
// if it fails, the student still sees their report, they just don't get a
// shareable link for that session.
export async function POST(request: NextRequest) {
  if (llmRouteLimiter) {
    const { success } = await llmRouteLimiter.limit(getClientIp(request));
    if (!success) {
      return NextResponse.json({ id: null } satisfies PersistSessionResponse, { status: 429 });
    }
  }

  let body: PersistSessionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.transcript) || body.transcript.length === 0 || !body.summary) {
    return NextResponse.json(
      { error: 'transcript and summary are required' },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const id = await persistSession(body.transcript, body.summary, user?.id ?? null);
  if (user && id) await recordSessionMemory(user.id, id, body.summary);
  return NextResponse.json({ id } satisfies PersistSessionResponse);
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const deleted = await deleteSessionForUser(id, user.id);
  return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 });
}
