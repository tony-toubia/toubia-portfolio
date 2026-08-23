#!/usr/bin/env node
/**
 * WRTT – IRS Form 990-N (e-Postcard) ingestion.
 *
 * The blind spot behind the sparsity in the main corpus. An organization with
 * gross receipts of $50,000 or less files the 990-N instead of a 990, and the
 * 990-N carries no officer roster at all - which is exactly where PTOs,
 * booster clubs and small youth leagues live. They were not missing because
 * the parser was weak; they are invisible to the form it reads.
 *
 * The 990-N does name one principal officer, and the IRS publishes the whole
 * set as a single pipe-delimited file. One name per organization rather than a
 * roster, but it is one name from a population that had none.
 *
 * What this file is NOT: a filing history. Verified against the published
 * archive - 1,541,627 rows, 1,541,625 distinct EINs, and the same count for
 * EIN+year - so the IRS ships the most recent e-Postcard per organization and
 * nothing before it. Two consequences worth stating plainly:
 *
 *   - There is no tenure span here. A person known only from a 990-N gets one
 *     filing year, so their Tenure input is zero. It still widens the span of
 *     anyone who also appears on a 990.
 *   - --since is therefore a liveness filter, not a date range. It keeps
 *     organizations whose LAST e-Postcard is recent enough to suggest they are
 *     still operating, and drops the ones that stopped filing.
 *
 * Usage:
 *   node scripts/wrtt/ingest-990n.mjs --out data/990n.ndjson
 *   node scripts/wrtt/ingest-990n.mjs --from data/990n.ndjson.gz --load --score
 *
 * Flags:
 *   --since   drop orgs whose latest e-Postcard predates  (default 2020)
 *   --markets JSON file of [{name,state,zips[]}]          (default scripts/wrtt/markets.json)
 *   --out     NDJSON destination                          (default data/990n.ndjson)
 *   --cache   directory for the downloaded archive        (default .cache/irs)
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const SOURCE = 'https://apps.irs.gov/pub/epostcard/data-download-epostcard.zip';
const UA = 'SLT-Ventures-WRTT/0.1 (+https://tonytoubia.com/slt/wrtt; research indexing)';
const EXTRACTOR_VERSION = 'irs990n-epostcard@0.1';

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Pipe-delimited, no header row. Column order is fixed by the IRS data
 * dictionary; only the ones used here are named. The address columns are
 * the organization's, not the officer's - the 990-N carries no personal
 * address, which is why this source can be published.
 */
const COL = {
  ein: 0, tax_year: 1, org_name: 2,
  period_begin: 5, period_end: 6,
  officer: 8,
  addr1: 9, city: 11, state: 13, zip: 14,
};

async function ensureFile(cacheDir) {
  const zip = path.join(cacheDir, 'data-download-epostcard.zip');
  const txt = path.join(cacheDir, 'data-download-epostcard.txt');
  if (fs.existsSync(txt) && (await fsp.stat(txt)).size > 0) return txt;

  await fsp.mkdir(cacheDir, { recursive: true });
  if (!fs.existsSync(zip) || (await fsp.stat(zip)).size === 0) {
    console.log('[wrtt-n] downloading the e-Postcard archive (~90MB)...');
    const res = await fetch(SOURCE, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`${SOURCE} returned ${res.status}`);
    await fsp.writeFile(zip, Buffer.from(await res.arrayBuffer()));
  }
  await exec('unzip', ['-o', '-q', zip, '-d', cacheDir], { maxBuffer: 1 << 28 });
  return txt;
}

async function main() {
  const from = arg('--from');
  if (from) { await load(from); return; }

  const since = Number(arg('--since', '2020'));
  const outFile = arg('--out', 'data/990n.ndjson');
  const cacheDir = arg('--cache', '.cache/irs');
  const markets = JSON.parse(await fsp.readFile(arg('--markets', 'scripts/wrtt/markets.json'), 'utf8'));
  const wanted = new Set(markets.flatMap((m) => m.zips));
  console.log(`[wrtt-n] target ZIPs: ${wanted.size} | still filing as of ${since}`);

  const txt = await ensureFile(cacheDir);
  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const out = fs.createWriteStream(outFile, { flags: 'w' });

  let scanned = 0, kept = 0, noOfficer = 0, dormant = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(txt), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    scanned++;
    const f = line.split('|');
    const zip = String(f[COL.zip] ?? '').slice(0, 5);
    if (!wanted.has(zip)) continue;

    // One row per EIN, so this is the organization's most recent filing.
    // An old one means it stopped filing, not that we are missing newer data.
    const year = Number(f[COL.tax_year]);
    if (!Number.isFinite(year) || year < since) { dormant++; continue; }

    const officer = String(f[COL.officer] ?? '').trim();
    if (!officer) { noOfficer++; continue; }

    const name = String(f[COL.org_name] ?? '').trim();

    out.write(JSON.stringify({
      ein: String(f[COL.ein] ?? '').padStart(9, '0'),
      org_name: name,
      // Classified in SQL by wrtt.classify_domain, like every other loader path.
      affiliation_domain: null,
      city: f[COL.city] || null,
      state: f[COL.state] || null,
      zip,
      // A 990-N filer reports gross receipts of $50,000 or less and no figure.
      // Left null rather than filled with the $50,000 ceiling: that would put a
      // number on every sheet that no filing actually states. org_scale gives
      // unknown revenue a small fixed weight, which is the right answer here -
      // these are small organizations, and Mobilization should say so. Their
      // value is in Breadth, which does not care about size.
      revenue: null,
      phone: null,
      website: null,
      tax_year: year,
      source_key: 'irs_990n',
      source_url: `${SOURCE}#${f[COL.ein]}-${year}`,
      extractor_version: EXTRACTOR_VERSION,
      people: [{
        name: officer,
        title: 'Principal officer',
        hours: null,
        // The form reports no compensation. Unknown, not zero - though an
        // organization under $50,000 is unlikely to be paying anyone.
        compensation: null,
        officer_kind: null,
        role_class: 'officer',
        snippet: `${officer} – principal officer named on the Form 990-N e-Postcard for tax year ${year}`,
      }],
    }) + '\n');
    kept++;
  }

  out.end();
  await new Promise((r) => out.on('finish', r));
  console.log(`[wrtt-n] scanned ${scanned.toLocaleString()} | kept ${kept} | skipped: ${dormant} last filed before ${since}, ${noOfficer} with no officer named`);
  console.log(`[wrtt-n] -> ${outFile}`);

  if (process.argv.includes('--load')) await load(outFile);
}

/** Reuses wrtt.load_990_batch; the record shape is deliberately identical. */
async function load(file) {
  for (const f of ['.env.local', '.env']) {
    try { process.loadEnvFile(f); } catch { /* absent */ }
  }
  const url = process.env.WRTT_DATABASE_URL;
  if (!url) {
    console.error('[wrtt-n] no WRTT_DATABASE_URL found in the environment or in .env.local.');
    process.exit(1);
  }
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 30 });

  const raw = file.endsWith('.gz')
    ? (await import('node:zlib')).gunzipSync(await fsp.readFile(file)).toString('utf8')
    : await fsp.readFile(file, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  if (!lines.length) { console.error(`[wrtt-n] ${file} decoded to no records.`); process.exit(1); }

  const CHUNK = 200;
  let orgs = 0, people = 0, affs = 0;
  for (let i = 0; i < lines.length; i += CHUNK) {
    const batch = lines.slice(i, i + CHUNK).map((l) => JSON.parse(l));
    const [row] = await sql`select * from wrtt.load_990_batch(${sql.json(batch)})`;
    orgs += row.organizations; people += row.people; affs += row.affiliations;
    console.log(`[wrtt-n] loaded ${Math.min(i + CHUNK, lines.length)}/${lines.length}`);
  }
  console.log(`[wrtt-n] loaded – ${orgs} orgs, ${people} new people, ${affs} affiliations`);

  if (process.argv.includes('--score')) {
    const [{ merged, remaining }] = await sql`select * from wrtt.resolve_people()`;
    console.log(`[wrtt-n] identities merged: ${merged} -> ${remaining} people`);
    const [{ families }] = await sql`select wrtt.rebuild_org_families() as families`;
    console.log(`[wrtt-n] organizational families: ${families}`);
    for (const m of await sql`select id, name from wrtt.market order by name`) {
      await sql`select wrtt.run_scoring(${m.id})`;
      console.log(`[wrtt-n] scored ${m.name}`);
    }
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
