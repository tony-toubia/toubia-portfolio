import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import {
  getMarket, getSheet, isConfigured,
  type Candidate, type Component, type ComponentKey,
} from '@/lib/wrtt/db';
import { cookies } from 'next/headers';
import { SheetNote } from '../Explainer';
import { recordHit } from '@/lib/wrtt/hits';
import { ADMIN_COOKIE } from '../profile/constants';
import { Verdict } from './Verdict';
import { NEGATIVE, type Verdict as V } from './verdicts';

export const dynamic = 'force-dynamic';

const COMPONENT_LABELS: Record<ComponentKey, string> = {
  M: 'Mobilization',
  B: 'Breadth',
  T: 'Tenure',
  R: 'Reach',
  A: 'Availability',
  X: 'Adjacency',
};

function confClass(c: number) {
  if (c < 0.4) return 'conf-low';
  if (c < 0.7) return 'conf-mid';
  return 'conf-high';
}

/**
 * Filings arrive in whatever case the preparer typed - "SURGE FASTPITCH"
 * beside "VidaDanceCompany Inc" - so titles and organization names are
 * normalized to title case at display time. The stored value keeps the
 * filing's own casing, since it is the evidence.
 *
 * CSS text-transform cannot do this (capitalize never lowercases), and no
 * heuristic recases acronyms perfectly. The rules here: small words stay
 * lower unless leading, single letters and vowelless short tokens read as
 * initialisms and keep their caps (FHS, KCK), digit-bearing tokens too (T3,
 * 4HG), a short allowlist covers common ones with vowels (PTO, CEO, USA),
 * corporate suffixes get their conventional forms, and Mc names get their
 * second cap back. The misses ("Msu", "Ijri") are rare and read fine.
 */
const TC_SMALL = new Set(['of', 'the', 'and', 'for', 'in', 'at', 'on', 'to', 'a', 'an', 'de', 'la', 'du', 'von', 'dem', 'en']);
const TC_ACRONYM = new Set(['pto', 'pta', 'usa', 'us', 'aau', 'ceo', 'cfo', 'coo', 'cto', 'cio', 'vp', 'evp', 'svp', 'md', 'dds', 'rn', 'kc', 'tn', 'ks', 'ii', 'iii', 'iv', 'vfw', 'ucc', 'lgbtq']);
const TC_SUFFIX: Record<string, string> = { inc: 'Inc', corp: 'Corp', co: 'Co', ltd: 'Ltd', llc: 'LLC', llp: 'LLP', nfp: 'NFP' };

function tcPart(part: string): string {
  const lower = part.toLowerCase();
  if (TC_SUFFIX[lower]) return TC_SUFFIX[lower];
  if (TC_ACRONYM.has(lower)) return lower.toUpperCase();
  if (part.length === 1 || /\d/.test(part)) return part.toUpperCase();
  if (part.length <= 5 && !/[aeiouy]/i.test(part)) return part.toUpperCase();
  const cased = lower.charAt(0).toUpperCase() + lower.slice(1);
  return cased.replace(/^Mc(\p{L})/u, (_, ch) => 'Mc' + ch.toUpperCase());
}

function titleCase(raw: string | null) {
  if (!raw) return raw ?? '';
  return raw
    .split(/\s+/)
    .map((word, i) => {
      // A word the preparer already mixed the case of ("VidaDanceCompany")
      // is deliberate; recasing it can only lose information.
      if (/\p{Lu}/u.test(word) && /\p{Ll}/u.test(word)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && TC_SMALL.has(lower)) return lower;
      // Case each segment separately so acronyms survive inside hyphenated
      // and slashed tokens ("LGBTQ-PLUS", "CEO/FOUNDER").
      return word.split(/([-/'])/).map((seg, j) => (j % 2 ? seg : seg && tcPart(seg))).join('');
    })
    .join(' ');
}

function tel(n: string | null) {
  if (!n || n.length !== 10) return null;
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

function site(u: string | null) {
  if (!u) return null;
  const bare = u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return { href: /^https?:\/\//i.test(u) ? u : `https://${u}`, label: bare.toLowerCase() };
}

/** "2023–2025", or just "2024" when a tenure sits inside one filing year. */
function span(start: string | null, end: string | null) {
  const a = start?.slice(0, 4);
  const b = end?.slice(0, 4);
  if (!a && !b) return null;
  if (!a || !b || a === b) return a ?? b ?? null;
  return `${a}–${b}`;
}

function money(n: number | null) {
  if (!n) return null;
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
}

function exact(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function Row({ c, market }: { c: Candidate; market: string }) {
  const comps = c.components ?? {};
  // Person-level establishment flag from the scoring run: two or more seats
  // on the college board, the economic development corporation, the hospital
  // board, a professional association. Those are honours conferred on people
  // who are senior somewhere the filing cannot see, and the index is looking
  // for the opposite - so the composite is discounted and the card says why.
  const est = (comps as Record<string, unknown>).establishment as
    | { flagged: boolean; seats?: number; orgs?: string[]; penalty?: number }
    | undefined;
  const negative = c.verdict ? NEGATIVE.has(c.verdict as V) : false;
  const confirmed = c.verdict === 'confirm';
  // Person-level employment flag from the scoring run: filings report
  // substantial compensation somewhere, so the whole composite was halved.
  // The chip explains a low-looking score; it is not an accusation.
  const emp = (comps as Record<string, unknown>).employment as
    | { flagged: boolean; max_comp?: number; org?: string; penalty?: number }
    | undefined;
  return (
    <div className={`wrtt-row${negative ? ' is-negative' : ''}${confirmed ? ' is-confirmed' : ''}`}>
      <div className="wrtt-rank">{String(c.rank_in_market).padStart(2, '0')}</div>

      <div>
        <div className="wrtt-name">
          {c.display_name}
          {emp?.flagged ? (
            <span
              className="wrtt-emp"
              title={`Filings report ${emp.max_comp ? exact(emp.max_comp) : 'substantial'} in compensation${emp.org ? ` at ${titleCase(emp.org)}` : ''}. The index looks for people who organize unpaid, so this score is discounted across the board.`}
            >
              SALARIED
            </span>
          ) : null}
          {est?.flagged ? (
            <span
              className="wrtt-est"
              title={`${est.seats} seats on the establishment circuit${est.orgs?.length ? ` – ${est.orgs.map(titleCase).join(', ')}` : ''}. College boards, economic development bodies, hospital boards and professional associations are honours that go to people senior elsewhere; the index looks for grassroots organizers, so this score is discounted.`}
            >
              ESTABLISHMENT
            </span>
          ) : null}
        </div>

        {/* Every claim carries its source. This is what makes the sheet read as
            research rather than surveillance. */}
        <ul className="wrtt-aff">
          {c.affiliations.map((a, i) => {
            const phone = tel(a.phone);
            const web = site(a.website);
            const years = span(a.start_date, a.end_date);
            return (
              <li key={i}>
                <span className="role">{titleCase(a.role_title)}</span>
                {' · '}
                {titleCase(a.org)}
                {/* This is the organization's revenue, not the person's pay.
                    Sitting beside a named individual it reads as a salary
                    unless it says so, so every figure carries the label. */}
                {a.revenue ? (
                  <>
                    {' · '}
                    <span className="wrtt-rev" title={`${titleCase(a.org)} reported ${exact(a.revenue)} in annual revenue`}>
                      <b>REV:</b> {money(a.revenue)}
                    </span>
                  </>
                ) : null}
                {years ? <span className="wrtt-span">{years}</span> : null}
                {a.source_key ? (
                  <span className="src">
                    {a.source_key}
                    {/* How many filings attest to this one tenure. Repeat filings
                        are evidence of a role, not additional roles. */}
                    {a.sources > 1 ? <b>&nbsp;×{a.sources}</b> : null}
                  </span>
                ) : null}
                {/* The organization's own published contact. There is no personal
                    contact detail in a 990, and none is inferred here. */}
                {phone || web ? (
                  <span className="wrtt-contact">
                    {phone ? <a href={`tel:+1${a.phone}`}>{phone}</a> : null}
                    {web ? (
                      <a href={web.href} target="_blank" rel="noopener noreferrer nofollow">
                        {web.label}
                      </a>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="wrtt-comp">
          {Object.entries(COMPONENT_LABELS).map(([k, label]) => {
            const comp = comps[k as ComponentKey] as Component | undefined;
            const off = !comp || comp.status === 'no_input';
            return (
              <span key={k} className={off ? 'off' : undefined} title={label}>
                {k}&nbsp;<b>{off ? 'n/a' : (comp!.norm ?? 0).toFixed(2)}</b>
              </span>
            );
          })}
        </div>

        <Verdict
          marketId={market}
          personId={c.person_id}
          current={c.verdict}
          note={c.verdict_note}
          by={c.verdict_by}
        />
      </div>

      <div className="wrtt-score">
        <div className="val">{c.wrtt_score.toFixed(0)}</div>
        <div className={`conf ${confClass(c.confidence)}`}>
          confidence {c.confidence.toFixed(2)}
        </div>
        <div className="wrtt-meter">
          <i style={{ width: `${Math.round(c.confidence * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default async function MarketSheet({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market: marketId } = await params;

  if (!isConfigured) {
    return (
      <div className="wrtt-note">
        <strong>Not connected.</strong> Set <code>WRTT_DATABASE_URL</code> and reload.
      </div>
    );
  }

  // Market lookup, the hit log's header read and the cookie jar are
  // independent; none of them should wait on another. The sheet itself is
  // not awaited here at all - it streams in below, so the title, the note
  // and the worksheet links paint while a cold hit is still fetching.
  const [market, jar] = await Promise.all([
    getMarket(marketId),
    cookies(),
    recordHit('sheet', { market: marketId, path: `/slt/wrtt/${marketId}` }),
  ]);
  if (!market) notFound();

  // The worksheet is a ranked list of named individuals packaged for outreach,
  // which is a different thing from a page about methodology - so it needs the
  // admin token, not the console password everyone shown the index receives.
  const token = process.env.WRTT_ADMIN_TOKEN;
  const isAdmin = Boolean(token) && jar.get(ADMIN_COOKIE)?.value === token;

  return (
    <>
      <Link href="/slt/wrtt" className="wrtt-back">
        ← Markets
      </Link>

      <h1 style={{ marginTop: 12 }}>
        {market.name}, {market.state}{' '}
        <span className={`tag tag-${market.status}`}>{market.status}</span>
      </h1>
      <SheetNote />

      {isAdmin ? (
        <p className="wrtt-sheetnote wrtt-worksheet">
          Research worksheet:{' '}
          <a href={`/slt/wrtt/${marketId}/export?n=25`}>top 25 CSV</a>
          {' · '}
          <a href={`/slt/wrtt/${marketId}/export?n=50`}>top 50 CSV</a>
        </p>
      ) : null}

      <Suspense fallback={<SheetSkeleton />}>
        <SheetRows marketId={marketId} people={market.people} />
      </Suspense>
    </>
  );
}

/** Three quiet bars where the rows will land. Never on screen for long. */
function SheetSkeleton() {
  return (
    <div className="wrtt-skeleton" aria-hidden="true">
      <i /><i /><i />
    </div>
  );
}

async function SheetRows({ marketId, people }: { marketId: string; people: number }) {
  const sheet = await getSheet(marketId, 50);
  if (sheet.length === 0) {
    return (
      <div className="wrtt-note">
        No scored candidates yet. Run the ingest, then{' '}
        <code>select wrtt.run_scoring(&apos;{marketId}&apos;);</code>
      </div>
    );
  }
  return (
    <>
      <h2>
        Top {sheet.length} · {people} scored in market
      </h2>
      <div className="wrtt-rows">
        {sheet.map((c) => (
          <Row key={c.person_id} c={c} market={marketId} />
        ))}
      </div>
      <div className="wrtt-note" style={{ marginTop: 24 }}>
        <strong>Reach, availability and adjacency have no inputs in this run.</strong> Their
        weight is excluded from the denominator rather than scored as zero, so the composite
        reflects only what was measured. <Link href="/slt/wrtt/method">Method →</Link>
      </div>
    </>
  );
}
