import fs from 'node:fs';
import path from 'node:path';

/**
 * Real-set few-shot examples for StudForge DESIGN mode.
 *
 * `scripts/ldraw/to-blueprint.mjs` compresses real sets (LDraw OMR models converted to StudForge's format) into
 * blueprints and ships the best one or two per subject in public/studforge/data/omr-blueprints/ (an index.json plus
 * one `<setId>.json` each: { setId, name, year, subject, label, labelPlural, authors, licence, blueprint, fidelity }).
 * The idea route reads them from disk here (never from the request), picks the one for the knowledge subject the
 * page resolved ("fireTruck", "castle", ...) and puts it in the USER message, so the long system prompt stays
 * byte-identical and cacheable. No file, no index, no match: no example, and the route behaves as it always did.
 *
 * Plain TypeScript with only node: imports, so a node script can import it directly (type stripping) to check the
 * composed message without calling the API (scripts/studforge-blueprint-test.mjs does).
 */

export type OmrExample = {
  setId: string; name: string; year: number | null; subject: string; label: string; labelPlural: string;
  authors: string[]; licence: string; blueprint: { base: Record<string, unknown>; ops: Record<string, unknown>[] };
};

/** The knowledge-base subject the page sends with a DESIGN request (only the fields this module reads). */
export type DesignSubject = { id: string; n?: number; palette: [string, number][]; pieces: { p25: number; p50: number; p75: number } | null; parts: [string, number][] };

export const EXAMPLES_DIR = path.join(process.cwd(), 'public', 'studforge', 'data', 'omr-blueprints');
const MAX_FILE = 12000;   // bytes: an example is a prompt section, keep a corrupt or oversized file out
const cache = new Map<string, Map<string, OmrExample[]>>();

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '');

/** Read and sanity-check every example listed in the index, grouped by subject (cached per directory). */
export function loadExamples(dir = EXAMPLES_DIR): Map<string, OmrExample[]> {
  const hit = cache.get(dir);
  if (hit) return hit;
  const bySubject = new Map<string, OmrExample[]>();
  try {
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as { examples?: { file?: unknown }[] };
    for (const entry of Array.isArray(index.examples) ? index.examples : []) {
      const file = typeof entry.file === 'string' && /^[\w.-]+\.json$/.test(entry.file) ? entry.file : null;
      if (!file) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        if (raw.length > MAX_FILE) continue;
        const j = JSON.parse(raw) as Record<string, unknown>;
        const bp = j.blueprint as OmrExample['blueprint'] | undefined;
        const subject = text(j.subject, 32), setId = text(j.setId, 24);
        if (!subject || !setId || !bp || typeof bp !== 'object' || !bp.base || !Array.isArray(bp.ops) || !bp.ops.length || bp.ops.length > 60) continue;
        const label = text(j.label, 32) || subject;
        const ex: OmrExample = {
          setId, name: text(j.name, 60), year: typeof j.year === 'number' ? j.year : null, subject, label,
          labelPlural: text(j.labelPlural, 40) || label + 's',
          authors: Array.isArray(j.authors) ? j.authors.map((a) => text(a, 60)).filter(Boolean).slice(0, 4) : [],
          licence: text(j.licence, 40) || 'CC BY 2.0', blueprint: { base: bp.base, ops: bp.ops },
        };
        if (!bySubject.has(subject)) bySubject.set(subject, []);
        bySubject.get(subject)!.push(ex);
      } catch { /* one bad file costs that example only */ }
    }
  } catch { /* no index: no examples */ }
  cache.set(dir, bySubject);
  return bySubject;
}

/** The example for a subject id (variants rotate through a subject's examples), or null. */
export function exampleFor(subjectId: string | null | undefined, variant = 0, dir = EXAMPLES_DIR): OmrExample | null {
  if (!subjectId || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(subjectId)) return null;
  const list = loadExamples(dir).get(subjectId);
  return list && list.length ? list[Math.abs(variant) % list.length] : null;
}

/** The example as a user-message section: the instruction, then the blueprint with one op per line. */
export function exampleSection(ex: OmrExample): string {
  const head = `Here is how a real ${ex.label} set (${ex.setId} ${ex.name}${ex.year ? ', ' + ex.year : ''}) is constructed, as a blueprint; design an ORIGINAL model for the idea, using similar construction (hollow body, floor, interior, roof last, proportions), not a copy:`;
  const body = `{"base": ${JSON.stringify(ex.blueprint.base)}, "ops": [\n${ex.blueprint.ops.map((o) => JSON.stringify(o)).join(',\n')}\n]}`;
  return `${head}\n${body}`;
}

/** The credit appended to a design's description when it was shown the example (kept within the 220-char limit). */
export function creditLine(ex: OmrExample): string {
  return `Inspired by how real ${ex.labelPlural} are built (set ${ex.setId} ${ex.name}).`;
}
export function withCredit(description: string, ex: OmrExample, max = 220): string {
  let credit = creditLine(ex);
  if (credit.length > max) credit = `Inspired by how real ${ex.labelPlural} are built.`.slice(0, max);
  const room = max - credit.length - 1;
  const desc = description.length > room ? description.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, '') + '…' : description;
  return desc ? `${desc} ${credit}` : credit;
}

/** The DESIGN-mode user message: the idea, the subject's real-set statistics, a real example when there is one. */
export function blueprintUserMessage(prompt: string, variant: number, s: DesignSubject | null, ex: OmrExample | null): string {
  const lines = [`Idea: ${prompt}`];
  if (s) {
    const pal = s.palette.map(([c, share]) => `${c} ${Math.round(share * 100)}%`).join(', ');
    const pcs = s.pieces ? `piece count p25 ${s.pieces.p25} / p50 ${s.pieces.p50} / p75 ${s.pieces.p75}` : 'no piece-count data';
    const top = s.parts.map(([id, share]) => `${id} (${Math.round(share * 100)}%)`).join(', ');
    lines.push(`Real sets of this subject (${s.id}${s.n ? ', ' + s.n + ' sets' : ''}): palette ${pal || 'unknown'}; ${pcs}; parts most sets use: ${top || 'unknown'}.`);
  }
  if (ex) lines.push(exampleSection(ex));
  if (variant > 0) lines.push(`This is design attempt #${variant + 1} for the same idea: give me a DIFFERENT design from before (another layout, pose, proportion or set of features), not a repeat.`);
  return lines.join('\n');
}
