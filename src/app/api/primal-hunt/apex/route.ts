import { NextResponse, type NextRequest } from 'next/server';
import { BadRequest } from '@/lib/primal-hunt/daily';
import { apexBoard, submitApex, validateApex } from '@/lib/primal-hunt/apex';

/**
 * GET  /api/primal-hunt/apex?device=<uuid>  -> the all-time top 10, entries, your standing
 * POST /api/primal-hunt/apex  { deviceId, name, classId, score, time, kills, level, bosses, waves, bonus }
 *
 * 503 { offline: true } when the leaderboard has no database configured.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const offline = () => NextResponse.json({ offline: true }, { status: 503 });

export async function GET(req: NextRequest) {
  const device = req.nextUrl.searchParams.get('device') ?? undefined;
  try {
    const b = await apexBoard(device);
    if (!b) return offline();
    return NextResponse.json(b, { headers: { 'Cache-Control': device ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30' } });
  } catch (e) {
    if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[primal-hunt] apex board failed', e);
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
    const s = validateApex(body);
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';
    const b = await submitApex(s, ip);
    if (!b) return offline();
    return NextResponse.json(b, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof BadRequest) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[primal-hunt] apex submit failed', e);
    return NextResponse.json({ error: 'leaderboard unavailable' }, { status: 502 });
  }
}
