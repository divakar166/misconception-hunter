import { NextRequest, NextResponse } from 'next/server';
import { clearMemory, deleteMemoryItem, listMemory } from '@/lib/memory';
import { getCurrentUser } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json({ items: await listMemory(user.id) });
}

// ?id=<item> removes one memory item; no id forgets everything.
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  const ok = id ? await deleteMemoryItem(user.id, id) : await clearMemory(user.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
