import Link from 'next/link';
import { cookies } from 'next/headers';
import { db, isConfigured } from '@/lib/wrtt/db';
import { ADMIN_COOKIE } from '../profile/constants';
import { Unlock } from '../profile/Unlock';
import { unlock } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

/**
 * Who has actually been here. Admin-only - the same shared password that
 * admits a visitor also admits the person being observed, and showing
 * someone their own tracks is a bad way to build trust. The page is not
 * linked from the console nav for the same reason.
 *
 * Deliberately does NOT record a hit of its own: the observer watching the
 * log should not appear in it.
 */

type Hit = {
  ts: string; kind: string; market: string | null; host: string | null;
  referer: string | null; city: string | null; region: string | null; country: string | null;
};

const KIND_LABEL: Record<string, string> = {
  gate_view: 'gate seen', gate_pass: 'entered', gate_fail: 'wrong password',
  page: 'markets', sheet: 'sheet', method: 'method', profile: 'profile', deck: 'DECK',
};

export default async function Activity() {
  const token = process.env.WRTT_ADMIN_TOKEN;
  const jar = await cookies();
  const authorized = Boolean(token) && jar.get(ADMIN_COOKIE)?.value === token;

  if (!authorized) {
    return (
      <>
        <Link href="/slt/wrtt" className="wrtt-back">← Markets</Link>
        <h1 style={{ marginTop: 12 }}>Activity</h1>
        <p className="lede">Visit log for the console. Admin only.</p>
        <Unlock configured={Boolean(token)} action={unlock} />
      </>
    );
  }

  if (!isConfigured) {
    return <div className="wrtt-note"><strong>Not connected.</strong></div>;
  }

  const sql = await db();
  const totals = await sql<{ kind: string; n: string; latest: string }[]>`
    select kind, count(*) as n, max(ts) as latest
      from wrtt.page_hit
     where ts > now() - interval '30 days'
     group by kind order by max(ts) desc`;
  const recent = await sql<Hit[]>`
    select ts::text, kind, market, host, referer, city, region, country
      from wrtt.page_hit
     order by ts desc limit 100`;

  return (
    <>
      <Link href="/slt/wrtt" className="wrtt-back">← Markets</Link>

      <h1 style={{ marginTop: 12 }}>Activity</h1>
      <p className="lede">
        Every request into the gated console, last 100 shown. No IPs are stored – location is
        the CDN&apos;s city-level guess. A <strong>deck</strong> row is the strongest signal:
        somebody opened the pitch.
      </p>

      <h2>Last 30 days</h2>
      <div className="wrtt-comp" style={{ marginBottom: 24 }}>
        {totals.length === 0 ? <span>Nothing yet – tracking started with this deploy.</span> : null}
        {totals.map((t) => (
          <span key={t.kind}>
            {KIND_LABEL[t.kind] ?? t.kind}&nbsp;<b>{t.n}</b>
          </span>
        ))}
      </div>

      <h2>Recent</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="wrtt-hits">
          <thead>
            <tr><th>when (UTC)</th><th>what</th><th>where from</th><th>host</th><th>referer</th></tr>
          </thead>
          <tbody>
            {recent.map((h, i) => (
              <tr key={i} className={h.kind === 'deck' ? 'is-deck' : undefined}>
                <td>{h.ts.slice(0, 16)}</td>
                <td>{KIND_LABEL[h.kind] ?? h.kind}{h.market ? ` · ${h.market}` : ''}</td>
                <td>{[h.city, h.region, h.country].filter(Boolean).join(', ') || '–'}</td>
                <td>{h.host ?? '–'}</td>
                <td>{h.referer ? h.referer.replace(/^https?:\/\//, '').slice(0, 60) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
