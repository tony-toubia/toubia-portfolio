import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = [
  '.itunes.apple.com',
  '.mzstatic.com',
  '.scdn.co',
  '.spotifycdn.com',
];

function isAllowedAudioUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_HOSTS.some(suffix => host.endsWith(suffix))) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url') || '';
  const target = isAllowedAudioUrl(rawUrl);

  if (!target) {
    return NextResponse.json(
      { error: 'Unsupported or invalid audio stream host.' },
      { status: 400 }
    );
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    const range = req.headers.get('range');
    if (range) headers['Range'] = range;

    const upstream = await fetch(target.toString(), { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const resHeaders = new Headers();
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    resHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type');
    resHeaders.set(
      'Content-Type',
      upstream.headers.get('content-type') || 'audio/mp4'
    );
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) resHeaders.set('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) resHeaders.set('Content-Range', contentRange);
    resHeaders.set('Accept-Ranges', 'bytes');
    resHeaders.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to proxy audio stream.' },
      { status: 502 }
    );
  }
}
