import { NextResponse, type NextRequest } from 'next/server';
import { BadRequest, board, submit, utcDay, validate } from '@/lib/primal-hunt/daily';

/**
 * GET  /api/primal-hunt/daily?day=YYYY-MM-DD&device=<uuid>  -> the day's top 10, entries, your standing
 * POST /api/primal-hunt/daily  { day, deviceId, name, classId, score, time, kills, level, bosses, victory, bonus }
 *
 * 503 { offline: true } when the leaderboard has no database configured.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const offline = () => NextResponse.json({ offline: true }, { status: 503 });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const device = q.get('device') ?? undefined;
  try {
    const b = await board(q.get('day') ?? utcDay(), device);
    if (!b) return offline();
    // Your own standing is personal; the plain board can be cached briefly.
    return NextResponse.json(b, { headers: { 'Cache-Control': device ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30' } });
  } catch (e) {
    if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[primal-hunt] board failed', e);
    return NextResponse.json({ error: 'leaderboard unavailable' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 2000) return NextResponse.json({ error: 'too big' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  try {
    const s = validate(body);
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
    const b = await submit(s, ip);
    if (!b) return offline();
    return NextResponse.json(b, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[primal-hunt] submit failed', e);
    return NextResponse.json({ error: 'leaderboard unavailable' }, { status: 502 });
  }
}
