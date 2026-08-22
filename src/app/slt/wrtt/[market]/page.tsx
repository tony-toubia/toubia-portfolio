import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMarket, getSheet, isConfigured, type Candidate } from '@/lib/wrtt/db';
import { Explainer } from '../Explainer';

export const dynamic = 'force-dynamic';

const COMPONENT_LABELS: Record<string, string> = {
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

function money(n: number | null) {
  if (!n) return null;
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
}

function Row({ c }: { c: Candidate }) {
  const comps = c.components ?? {};
  return (
    <div className="wrtt-row">
      <div className="wrtt-rank">{String(c.rank_in_market).padStart(2, '0')}</div>

      <div>
        <div className="wrtt-name">{c.display_name}</div>

        {/* Every claim carries its source. This is what makes the sheet read as
            research rather than surveillance. */}
        <ul className="wrtt-aff">
          {c.affiliations.map((a, i) => (
            <li key={i}>
              <span className="role">{a.role_title}</span>
              {' · '}
              {a.org}
              {a.revenue ? ` · ${money(a.revenue)}` : ''}
              {a.source_key ? <span className="src">{a.source_key}</span> : null}
            </li>
          ))}
        </ul>

        <div className="wrtt-comp">
          {Object.entries(COMPONENT_LABELS).map(([k, label]) => {
            const comp = comps[k] as
              | { raw: number | null; norm: number | null; weight: number; status?: string }
              | undefined;
            const off = !comp || comp.status === 'no_input';
            return (
              <span key={k} className={off ? 'off' : undefined} title={label}>
                {k}&nbsp;<b>{off ? 'n/a' : (comp!.norm ?? 0).toFixed(2)}</b>
              </span>
            );
          })}
        </div>
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

  const market = await getMarket(marketId);
  if (!market) notFound();

  const sheet = await getSheet(marketId, 50);

  return (
    <>
      <Link href="/slt/wrtt" className="wrtt-back">
        ← Markets
      </Link>

      <h1 style={{ marginTop: 12 }}>
        {market.name}, {market.state}{' '}
        <span className={`tag tag-${market.role}`}>{market.role}</span>
      </h1>
      <p className="lede">
        Ranked within market, not nationally – the question is whether someone is one of the
        most connected people in <em>this</em> town. Scores show confidence alongside, always.
      </p>

      <Explainer compact />

      {sheet.length === 0 ? (
        <div className="wrtt-note">
          No scored candidates yet. Run the ingest, then{' '}
          <code>select wrtt.run_scoring(&apos;{marketId}&apos;);</code>
        </div>
      ) : (
        <>
          <h2>
            Top {sheet.length} · {market.people} scored in market
          </h2>
          <div className="wrtt-rows">
            {sheet.map((c) => (
              <Row key={c.person_id} c={c} />
            ))}
          </div>
          <div className="wrtt-note" style={{ marginTop: 24 }}>
            <strong>Reach, availability and adjacency have no inputs in this run.</strong> They
            need a licensed professional-history source, which is deliberately out of the POC.
            Their weight is excluded from the denominator rather than scored as zero, so the
            composite reflects only what was actually measured.
          </div>
        </>
      )}
    </>
  );
}
