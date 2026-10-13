import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import sharp from 'sharp';

export type ReferenceSource = { title: string; url: string };
export type Concept = { id: string; name: string; description: string; features: string[]; sketch: { base: { w: number; d: number; color: string }; ops: Record<string, unknown>[] } };
export type ConceptSelection = { prompt: string; concept: Concept; sources: ReferenceSource[]; identity: string; referenceStatus: string; imageDigest: string; expires: number };

// This is the school identified by the user, not the similarly named schools in other states.
// Both assets are linked by the school's official homepage, checked 13 October 2026.
export function schoolReference(prompt: string) {
  if (!/highlands?\b/i.test(prompt) || !/hawks?|mascot|elementary/i.test(prompt) || !/fairway|kansas|\bks\b|shawnee|smsd/i.test(prompt)) return null;
  return {
    identity: 'Highlands Hawks — Highlands Elementary, Shawnee Mission School District, Kansas',
    image: 'https://resources.finalsite.net/images/v1528228146/smsdorg/yvxlmn6p4ngmplcxqr2o/logo-highlands-elementary.svg',
    sources: [
      { title: 'Highlands Elementary — official school website', url: 'https://highlands.smsd.org/' },
      { title: 'Highlands Hawks — principal’s welcome', url: 'https://highlands.smsd.org/about/principalmission' },
    ],
  };
}

let officialLogo: { at: number; image: NonNullable<ReturnType<typeof imageInput>> } | null = null;
/** Convert the genuine vector logo for vision input; never fetch an arbitrary client URL. */
export async function schoolReferenceImage(prompt: string): Promise<NonNullable<ReturnType<typeof imageInput>> | null> {
  const reference = schoolReference(prompt);
  if (!reference) return null;
  if (officialLogo && Date.now() - officialLogo.at < 3600000) return officialLogo.image;
  try {
    const response = await fetch(reference.image, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const svg = Buffer.from(await response.arrayBuffer());
    if (svg.length > 150000) return null;
    const png = await sharp(svg, { density: 288 }).resize({ width: 1200 }).png().toBuffer();
    const image = { type: 'base64' as const, media_type: 'image/png' as const, data: png.toString('base64') };
    officialLogo = { at: Date.now(), image };
    return image;
  } catch { return null; }
}

export function safeSource(raw: unknown): ReferenceSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== 'string' || r.url.length > 1600) return null;
  try {
    const url = new URL(r.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { url: url.href, title: typeof r.title === 'string' ? r.title.slice(0, 160) : url.hostname };
  } catch { return null; }
}

export function imageInput(raw: unknown): { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/webp'; data: string } | null {
  if (typeof raw !== 'string' || raw.length > 1100000) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!match || match[2].length < 16) return null;
  return { type: 'base64', media_type: match[1] as 'image/png' | 'image/jpeg' | 'image/webp', data: match[2] };
}

export const digestImage = (image: unknown) => createHash('sha256').update(typeof image === 'string' ? image : '').digest('hex');

/** Signed selections bind the approved diagram and its actual search sources to this prompt. */
export function signSelection(selection: Omit<ConceptSelection, 'expires'>, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ ...selection, expires: Date.now() + 60 * 60 * 1000 })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}

export function readSelection(raw: unknown, prompt: string, image: unknown, secret: string): ConceptSelection | null {
  if (typeof raw !== 'string' || raw.length > 48000) return null;
  const [payload, signature, extra] = raw.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ConceptSelection;
    if (s.prompt !== prompt || s.expires < Date.now() || !s.concept?.sketch || s.imageDigest !== digestImage(image)) return null;
    return s;
  } catch { return null; }
}

/** Preserve the approved proportions and pose by starting with its exact structural operations. */
export function followsSelection(bp: Concept['sketch'], concept: Concept): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
    return value;
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  if (!same(bp.base, concept.sketch.base)) return false;
  if (!concept.sketch.ops.every((op, i) => same(op, bp.ops[i]))) return false;
  const cells = (op: Record<string, unknown>) => {
    if (op.op !== 'box' && op.op !== 'slab') return [];
    const y0 = Number(op.op === 'slab' ? op.y : op.y0), y1 = Number(op.op === 'slab' ? Number(op.y) + 1 : op.y1);
    const result: string[] = [];
    for (let x = Number(op.x0); x <= Number(op.x1); x++) for (let z = Number(op.z0); z <= Number(op.z1); z++) for (let y = y0; y <= y1; y++) result.push(`${x},${y},${z}`);
    return result;
  };
  const structure = new Map<string, unknown>();
  for (const op of concept.sketch.ops) for (const cell of cells(op)) structure.set(cell, op.color);
  const changed = new Set<string>();
  let added = 0;
  for (const op of bp.ops.slice(concept.sketch.ops.length)) {
    // Box/slab details may add eyes and markings; they may not repaint the shirt/body wholesale
    // or grow a new giant silhouette around the approved one.
    const fill = cells(op);
    for (const cell of fill) {
      if (structure.has(cell)) { if (structure.get(cell) !== op.color) changed.add(cell); }
      else added++;
    }
    if (op.op === 'roof') return false; // a new bulk roof changes a concept made from box/slab structure
  }
  return changed.size <= Math.max(12, structure.size * .16) && added <= Math.max(36, structure.size * .3);
}
