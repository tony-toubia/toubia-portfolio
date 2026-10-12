import { NextResponse, type NextRequest } from 'next/server';

/**
 * POST /api/studforge/idea  { prompt, builders: [{ kind, keys }], colors: [ids], styles: [ids] }
 * Turns a StudForge prompt into a design brief the local brick engine can build.
 * Responds { brief, source: 'claude' }, or { source: 'local', reason } so the page
 * falls back to its own generator: 200 'no-key' (not configured), 429 'rate-limited',
 * 502 'upstream' (API error or timeout). The key is read from ANTHROPIC_API_KEY only.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MODEL = process.env.STUDFORGE_MODEL || 'claude-sonnet-5-5';
const FEATURE_IDS = ['garden', 'flag', 'chimney', 'stories', 'roof', 'minifig'];
const WINDOW_MS = 10 * 60 * 1000, PER_IP = 20, GLOBAL = 300, TIMEOUT_MS = 8000;
const NO_STORE = { 'Cache-Control': 'no-store' };

type Vocab = { prompt: string; builders: { kind: string; keys: string[] }[]; colors: string[]; styles: string[] };
type Brief = {
  subject: string; kind: string | null; style: string | null; colors: string[]; scale?: number;
  features: Record<string, boolean | string>; name: string; description: string; tagline?: string;
};

const local = (reason: string, status = 200) => NextResponse.json({ source: 'local', reason }, { status, headers: NO_STORE });

/* ── in-memory limiter (per instance; bounds cost, not a security boundary) ── */
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now(), keep = (arr: number[] = []) => arr.filter((t) => now - t < WINDOW_MS);
  const mine = keep(hits.get(ip)), all = keep(hits.get('*'));
  if (hits.size > 5000) hits.clear(); // a crude sweep so a flood of IPs cannot grow the map forever
  if (mine.length >= PER_IP || all.length >= GLOBAL) return true;
  mine.push(now); all.push(now); hits.set(ip, mine); hits.set('*', all);
  return false;
}

/* ── request vocab ── */
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '');
const strList = (v: unknown, max: number, len = 32) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);
function readVocab(body: unknown): Vocab | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const prompt = str(b.prompt, 200);
  if (!prompt) return null;
  const builders = (Array.isArray(b.builders) ? b.builders : []).slice(0, 40)
    .map((x) => ({ kind: str((x as Record<string, unknown>)?.kind, 32), keys: strList((x as Record<string, unknown>)?.keys, 8) }))
    .filter((x) => x.kind);
  return { prompt, builders, colors: strList(b.colors, 40), styles: strList(b.styles, 40) };
}

function systemPrompt(v: Vocab): string {
  const kinds = v.builders.map((b) => `${b.kind} (${b.keys.join(', ')})`).join('; ');
  return [
    'You are the design brain of StudForge, a web toy that turns a short idea into a buildable LEGO-style brick model.',
    'A rule-based engine builds the model from a plain-English SUBJECT: it picks a builder by the keywords in the subject, reads colour words and style words, and sizes by scale words.',
    'Your job: turn the user\'s idea into a brief that the engine will build well, and give it a fun name and description in an upbeat toy-box voice.',
    `Builder kinds and the keywords that select them: ${kinds || 'none'}.`,
    `Colour ids: ${v.colors.join(', ') || 'none'}. Style ids: ${v.styles.join(', ') || 'none'}.`,
    `Feature ids you may set: ${FEATURE_IDS.join(', ')}.`,
    'Rules: the subject MUST contain one of the builder keywords (choose the closest kind; the engine cannot build anything else). Keep the subject short (2-6 plain words, no colours needed since colors is separate). Use only ids from the lists above; use null when unsure. Never mention LEGO trademarks in the name.',
    'Respond with ONLY a JSON object, no prose, no code fences, exactly these keys:',
    '{"subject": string, "kind": string|null, "style": string|null, "colors": [up to 3 colour ids, primary first], "scale": number 0.6-1.8 (1 = normal), "features": {featureId: boolean|string}, "name": string (max 40 chars), "description": string (max 200 chars), "tagline": string (one playful line, max 100 chars)}',
  ].join('\n');
}

/* ── normalise Claude's answer against the vocab the page sent ── */
function toBrief(raw: unknown, v: Vocab): Brief | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kinds = new Set(v.builders.map((b) => b.kind)), colors = new Set(v.colors), styles = new Set(v.styles);
  const subject = str(r.subject, 120) || v.prompt;
  const features: Record<string, boolean | string> = {};
  if (r.features && typeof r.features === 'object') {
    for (const [k, val] of Object.entries(r.features as Record<string, unknown>)) {
      if (!FEATURE_IDS.includes(k)) continue;
      if (typeof val === 'boolean') features[k] = val;
      else if (typeof val === 'string' && str(val, 24)) features[k] = str(val, 24);
    }
  }
  const scale = typeof r.scale === 'number' && Number.isFinite(r.scale) ? Math.min(1.8, Math.max(0.6, r.scale)) : undefined;
  const brief: Brief = {
    subject,
    kind: typeof r.kind === 'string' && kinds.has(r.kind) ? r.kind : null,
    style: typeof r.style === 'string' && styles.has(r.style) ? r.style : null,
    colors: [...new Set(strList(r.colors, 6).filter((c) => colors.has(c)))].slice(0, 3),
    features,
    name: str(r.name, 40) || subject.replace(/\b\w/g, (c) => c.toUpperCase()),
    description: str(r.description, 200),
  };
  if (scale !== undefined) brief.scale = scale;
  const tagline = str(r.tagline, 120);
  if (tagline) brief.tagline = tagline;
  return brief;
}

function parseJson(text: string): unknown {
  const inner = text.replace(/```[a-z]*\s*/gi, '').trim();
  const a = inner.indexOf('{'), z = inner.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  try { return JSON.parse(inner.slice(a, z + 1)); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return local('no-key');
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 16000) return NextResponse.json({ error: 'too big' }, { status: 413, headers: NO_STORE });
    body = JSON.parse(text);
  } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: NO_STORE }); }
  const vocab = readVocab(body);
  if (!vocab) return NextResponse.json({ error: 'prompt required' }, { status: 400, headers: NO_STORE });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  if (limited(ip)) return local('rate-limited', 429);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1024, output_config: { effort: 'low' }, system: systemPrompt(vocab),
        messages: [{ role: 'user', content: `Idea: ${vocab.prompt}` }],
      }),
    });
    if (!res.ok) { console.error('[studforge] idea upstream status', res.status); return local('upstream', 502); }
    const data = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
    if (data.stop_reason === 'refusal') return local('no-brief');
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
    const brief = toBrief(parseJson(text), vocab);
    if (!brief) return local('no-brief');
    return NextResponse.json({ brief, source: 'claude' }, { headers: NO_STORE });
  } catch (e) {
    console.error('[studforge] idea upstream failed', e instanceof Error ? e.name : 'error');
    return local('upstream', 502);
  } finally { clearTimeout(timer); }
}
