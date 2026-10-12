import { NextResponse, type NextRequest } from 'next/server';
import { BadRequest } from '@/lib/primal-hunt/daily';
import { createRoom, inbox, joinRoom, sendSignal } from '@/lib/primal-hunt/rooms';

/**
 * Co-op signalling for Primal Hunt (see src/lib/primal-hunt/rooms.ts).
 *
 * POST { action: 'create', id }                          -> { code, iceServers }
 * POST { action: 'join', code, id, name }                -> { hostId, iceServers }
 * POST { action: 'signal', code, from, to, kind, body }  -> { ok }      kind: offer | answer | bye
 * GET  ?code=&id=&after=                                  -> { messages: [{ id, from, kind, body }] }
 *
 * 503 { offline: true } when no database is configured.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const offline = () => NextResponse.json({ offline: true }, { status: 503 });
const fail = (e: unknown) => {
  if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error('[primal-hunt] room failed', e);
  return NextResponse.json({ error: 'co-op unavailable' }, { status: 502 });
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    const r = await inbox(q.get('code') ?? '', q.get('id') ?? '', Number(q.get('after') ?? 0));
    return r ? NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } }) : offline();
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 16000) return NextResponse.json({ error: 'too big' }, { status: 413 });
    b = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  try {
    const s = (k: string) => String(b[k] ?? '');
    let r;
    if (b.action === 'create') r = await createRoom(s('id'));
    else if (b.action === 'join') r = await joinRoom(s('code'), s('id'), s('name'));
    else if (b.action === 'signal') r = await sendSignal(s('code'), s('from'), s('to'), s('kind'), b.body ?? {});
    else return NextResponse.json({ error: 'bad action' }, { status: 400 });
    return r ? NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } }) : offline();
  } catch (e) { return fail(e); }
}
