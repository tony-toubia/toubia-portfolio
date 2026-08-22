import Link from 'next/link';
import { getMarkets, isConfigured } from '@/lib/wrtt/db';
import { Intro } from './Explainer';

export const dynamic = 'force-dynamic';

function SetupNotice() {
  return (
    <div className="wrtt-note">
      <strong>Not connected.</strong> Set <code>WRTT_DATABASE_URL</code> to the Supabase
      session-pooler connection string, then reload.
      <pre>{`# .env.local  (and Vercel → Settings → Environment Variables)
WRTT_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`}</pre>
    </div>
  );
}

export default async function WrttHome() {
  if (!isConfigured) {
    return (
      <>
        <h1>Markets</h1>
        <p className="lede">Territories under index, with coverage and last scoring run.</p>
        <SetupNotice />
      </>
    );
  }

  let markets;
  try {
    markets = await getMarkets();
  } catch (e) {
    return (
      <>
        <h1>Markets</h1>
        <div className="wrtt-note">
          <strong>Database unreachable.</strong> {(e as Error).message}
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Markets</h1>

      {/* Three sentences, then the listings. The full explanation is a click
          away at /slt/wrtt/method rather than in front of the work. */}
      <Intro />

      <div className="wrtt-markets">
        {markets.map((m) => (
          <Link key={m.id} href={`/slt/wrtt/${m.id}`} className="wrtt-market">
            <div className="nm">{m.name}</div>
            <div className="meta">
              {m.state} · {m.zips.length} ZIPs · {m.status}{' '}
              <span className={`tag tag-${m.role}`}>{m.role}</span>
            </div>
            <dl>
              <div>
                <dt>People</dt>
                <dd>{m.people.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Orgs</dt>
                <dd>{m.orgs.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Scored</dt>
                <dd>{m.last_run ? m.last_run.slice(0, 10) : '–'}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}
