#!/usr/bin/env node
/**
 * WRTT – IRS Form 990 Part VII ingestion.
 *
 * Part VII of the 990 lists officers, directors, trustees and key employees by
 * name and title with hours per week. It is the richest single source in the
 * spec and it is fully deterministic: no inference, no cost.
 *
 * The IRS publishes it as ~100MB yearly ZIP bundles rather than per-EIN, so
 * rather than building an EIN index we stream every filing once and keep only
 * those whose filer ZIP falls inside a market we care about. One pass, and the
 * output is already market-scoped.
 *
 * Usage:
 *   # populate a database from the checked-in corpus (seconds, no download)
 *   node scripts/wrtt/ingest-990.mjs --from data/990-full.ndjson.gz --score
 *
 *   # re-extract from the IRS bundles (~40 min for three years)
 *   node scripts/wrtt/ingest-990.mjs --years 2024,2025,2026 --out data/990-full.ndjson
 *   node scripts/wrtt/ingest-990.mjs --years 2024 --zips 66206,66209 --limit 1
 *
 * Flags:
 *   --from    load an existing NDJSON (.gz accepted) and skip the scrape
 *   --years   comma-separated filing years to pull        (default 2024)
 *   --zips    comma-separated ZIPs to keep                (default: read from --markets file)
 *   --markets JSON file of [{name,state,zips[]}]          (default scripts/wrtt/markets.json)
 *   --limit   stop after N bundles, for smoke tests
 *   --out     NDJSON destination                          (default data/990.ndjson)
 *   --cache   directory to keep downloaded bundles        (default .cache/irs)
 *   --load    also write straight to Postgres via WRTT_DATABASE_URL
 *   --score   after loading, run scoring for every market
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Pick up WRTT_DATABASE_URL from .env.local the same way `next dev` does, so
// --load works without remembering --env-file. A real environment variable
// already set wins: loadEnvFile does not overwrite what is there.
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* absent, or Node < 20.12 */ }
}

const exec = promisify(execFile);
const INDEX_URL = 'https://www.irs.gov/charities-non-profits/form-990-series-downloads';
const UA = 'SLT-Ventures-WRTT/0.1 (+https://tonytoubia.com/slt/wrtt; research indexing)';
const EXTRACTOR_VERSION = 'irs990-partvii@0.1';

/** Verbatim title -> the normalized role_class the scoring model weights. */
const ROLE_RULES = [
  [/\bfounder\b/i,                              'founder'],
  [/\b(board\s+)?chair(man|woman|person)?\b/i,  'chair'],
  [/\bpresident\b/i,                            'president'],
  [/\b(vice[\s-]?president|vp|treasurer|secretary|officer)\b/i, 'officer'],
  [/\bcommittee\s+chair\b/i,                    'committee_chair'],
  [/\b(coach|organizer|registrar|league\s+director)\b/i, 'coach_organizer'],
  [/\b(executive\s+director|director)\b/i,      'director'],
  [/\b(board\s+member|trustee)\b/i,             'board_member'],
  [/\b(staff|manager|coordinator|employee)\b/i, 'staff'],
  [/\bvolunteer\b/i,                            'volunteer'],
  [/\bmember\b/i,                               'member'],
];

function classifyRole(title) {
  const t = String(title || '');
  for (const [re, cls] of ROLE_RULES) if (re.test(t)) return cls;
  return 'board_member';           // Part VII's default population
}

/** Coarse NTEE-free bucketing from the organization's own name. */
const DOMAIN_RULES = [
  [/\b(school|pto|pta|education|scholar|academy|university|college)\b/i, 'education'],
  [/\b(soccer|baseball|softball|hockey|swim|aquatic|lacrosse|athletic|sports|little league|booster)\b/i, 'youth_sports'],
  [/\b(church|ministr|parish|congregation|temple|synagogue|faith)\b/i,   'faith'],
  [/\b(art|museum|theat|symphony|orchestra|ballet|cultur|music)\b/i,     'arts'],
  [/\b(chamber|rotary|kiwanis|lions|optimist|jaycee|civic|city of|county)\b/i, 'civic'],
  [/\b(hospital|health|clinic|hospice|medical|cancer)\b/i,               'health'],
  [/\b(foundation|fund|charit|philanthrop|united way)\b/i,               'philanthropy'],
  [/\b(homes association|neighborhood|residents|homeowners|hoa)\b/i,     'neighborhood'],
];

function classifyDomain(name) {
  const n = String(name || '');
  for (const [re, dom] of DOMAIN_RULES) if (re.test(n)) return dom;
  return 'business';
}

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Scrape the IRS download page rather than guessing URL patterns – the
 *  naming changed between 2020 and 2021 and will change again. */
async function bundleUrls(years) {
  const res = await fetch(INDEX_URL, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`IRS index page returned ${res.status}`);
  const html = await res.text();
  const all = [...html.matchAll(/href="([^"]+\.zip)"/gi)].map((m) => m[1]);
  return all.filter((u) => years.some((y) => u.includes(`/${y}/`)));
}

async function ensureBundle(url, cacheDir) {
  const file = path.join(cacheDir, path.basename(url));
  if (fs.existsSync(file) && (await fsp.stat(file)).size > 0) return file;
  await fsp.mkdir(cacheDir, { recursive: true });
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// Built on first use rather than imported at module scope: --from loads an
// already-extracted corpus and never parses a byte of XML, so it should not
// need the scrape's dependencies installed to run.
let parser = null;
async function getParser() {
  if (!parser) {
    const { XMLParser } = await import('fast-xml-parser');
    parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
  }
  return parser;
}

function asArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** Pull the filer block and Part VII roster out of one filing. */
function parseFiling(xml, url) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return null;
  }
  const ret = doc?.Return;
  if (!ret) return null;

  const filer = ret.ReturnHeader?.Filer;
  if (!filer) return null;

  const addr = filer.USAddress;
  if (!addr) return null;                        // foreign filers are out of scope

  const zip5 = String(addr.ZIPCd ?? '').slice(0, 5);
  const name =
    filer.BusinessName?.BusinessNameLine1Txt ??
    filer.BusinessName?.BusinessNameLine1 ??
    filer.Name?.BusinessNameLine1;

  const data = ret.ReturnData ?? {};
  const body = data.IRS990 ?? data.IRS990EZ ?? {};

  // Contact belongs to the organization, never the person: Part VII carries
  // no personal address, phone or email, which is exactly why this data is
  // publishable. The filer's own phone is on every return and roughly half
  // list a real website, so a candidate can be reached through the body they
  // lead rather than at home.
  const phoneRaw = String(filer.PhoneNum ?? ret.ReturnHeader?.PhoneNum ?? '').replace(/\D/g, '');
  const phone = phoneRaw.length === 10 ? phoneRaw : null;

  const siteRaw = String(body.WebsiteAddressTxt ?? '').trim();
  const website =
    siteRaw && !/^(n\/?a|none|no|-+)$/i.test(siteRaw) ? siteRaw.slice(0, 200) : null;

  const groups = [
    ...asArray(body.Form990PartVIISectionAGrp),
    ...asArray(body.OfficerDirectorTrusteeEmplGrp),
  ];

  const people = [];
  for (const g of groups) {
    const person =
      g.PersonNm ?? g.BusinessName?.BusinessNameLine1Txt ?? null;
    if (!person || typeof person !== 'string') continue;
    const title = g.TitleTxt ?? g.TitleTxtOrRoleTxt ?? '';
    people.push({
      name: person.trim(),
      title: String(title).trim(),
      hours: g.AverageHoursPerWeekRt ? Number(g.AverageHoursPerWeekRt) : null,
      role_class: classifyRole(title),
      // The snippet is mandatory: it makes a bad extraction visible and it is
      // what a publisher reads on the evidence card. (spec §6.2)
      snippet: `${person.trim()} – ${String(title).trim() || 'no title given'}`.slice(0, 300),
    });
  }
  if (!people.length) return null;

  const revenue =
    body.CYTotalRevenueAmt ?? body.TotalRevenueAmt ?? body.TotalRevenueAndExpensesAmt ?? null;

  return {
    ein: String(filer.EIN ?? '').padStart(9, '0'),
    org_name: String(name ?? '').trim(),
    affiliation_domain: classifyDomain(name),
    city: addr.CityNm ?? null,
    state: addr.StateAbbreviationCd ?? null,
    zip: zip5,
    revenue: revenue == null ? null : Number(revenue),
    phone,
    website,
    tax_year: ret.ReturnHeader?.TaxYr ? Number(ret.ReturnHeader.TaxYr) : null,
    source_url: url,
    extractor_version: EXTRACTOR_VERSION,
    people,
  };
}

async function main() {
  // Loading a corpus that was already extracted skips the scrape entirely.
  // The bundles are ~40 minutes of download and unzip for a result that does
  // not change, so the checked-in NDJSON is the normal way to populate a
  // fresh database.
  const from = arg('--from');
  if (from) {
    await load(from);
    return;
  }

  const years = (arg('--years', '2024')).split(',').map((s) => s.trim());
  const marketsFile = arg('--markets', 'scripts/wrtt/markets.json');
  const outFile = arg('--out', 'data/990.ndjson');
  const cacheDir = arg('--cache', '.cache/irs');
  const limit = Number(arg('--limit', '0')) || 0;

  let wanted;
  if (arg('--zips')) {
    wanted = new Set(arg('--zips').split(',').map((s) => s.trim()));
  } else {
    const markets = JSON.parse(await fsp.readFile(marketsFile, 'utf8'));
    wanted = new Set(markets.flatMap((m) => m.zips));
  }
  console.log(`[wrtt] target ZIPs: ${wanted.size}`);

  await getParser();

  let urls = await bundleUrls(years);
  if (limit) urls = urls.slice(0, limit);
  console.log(`[wrtt] bundles for ${years.join(',')}: ${urls.length}`);

  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const out = fs.createWriteStream(outFile, { flags: 'w' });

  let scanned = 0, kept = 0, officers = 0;

  const zipTags = [...wanted].map((z) => `<ZIPCd>${z}`);

  for (const [i, url] of urls.entries()) {
    const file = await ensureBundle(url, cacheDir);

    // Bulk-extract once per bundle. Spawning unzip per member would mean
    // ~17k processes for a single bundle; one spawn and a directory walk is
    // two orders of magnitude faster.
    const workDir = path.join(cacheDir, '_work');
    await fsp.rm(workDir, { recursive: true, force: true });
    await fsp.mkdir(workDir, { recursive: true });
    await exec('unzip', ['-o', '-q', file, '-d', workDir], { maxBuffer: 1 << 28 });

    const stack = [workDir];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { stack.push(full); continue; }
        if (!entry.name.endsWith('.xml')) continue;

        scanned++;
        const xml = await fsp.readFile(full, 'utf8');

        // Two cheap string prefilters before paying for a full XML parse.
        if (!xml.includes('Form990PartVIISectionAGrp') &&
            !xml.includes('OfficerDirectorTrusteeEmplGrp')) continue;
        if (!zipTags.some((t) => xml.includes(t))) continue;

        const rec = parseFiling(xml, `${url}#${entry.name}`);
        if (!rec || !wanted.has(rec.zip)) continue;

        out.write(JSON.stringify(rec) + '\n');
        kept++;
        officers += rec.people.length;
      }
    }

    await fsp.rm(workDir, { recursive: true, force: true });
    console.log(`[wrtt] bundle ${i + 1}/${urls.length}  scanned=${scanned}  kept=${kept}  officers=${officers}`);
  }

  out.end();
  await new Promise((r) => out.on('finish', r));
  console.log(`[wrtt] done – ${kept} in-market filings, ${officers} named officers -> ${outFile}`);

  if (process.argv.includes('--load')) await load(outFile);
}

/**
 * Open the connection, and recover from the one thing that reliably goes wrong
 * in a Supabase connection string. The session pooler lives behind a per-shard
 * hostname – aws-0-<region> or aws-1-<region> – and which one a project sits on
 * is not derivable from the project ref or the region. Get it wrong and
 * Supavisor answers "Tenant or user not found", which reads like a bad password
 * and is not. Rather than making that a puzzle, try the other shard and say so.
 */
async function connect(url) {
  let postgres;
  try {
    ({ default: postgres } = await import('postgres'));
  } catch {
    console.error('[wrtt] the "postgres" driver is not installed. Run: npm install');
    process.exit(1);
  }

  const open = async (u) => {
    const sql = postgres(u, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 30 });
    await sql`select 1`;
    return sql;
  };

  try {
    return await open(url);
  } catch (e) {
    const alt = url.includes('aws-0-') ? url.replace('aws-0-', 'aws-1-')
              : url.includes('aws-1-') ? url.replace('aws-1-', 'aws-0-')
              : null;

    if (!alt || !/tenant or user not found/i.test(String(e.message))) throw e;

    console.warn(`[wrtt] ${e.message}`);
    console.warn('[wrtt] that is the wrong pooler shard, not a bad password. Trying the other one...');
    const sql = await open(alt);
    console.warn(
      `[wrtt] connected via ${new URL(alt).host}. Update WRTT_DATABASE_URL to that host\n` +
      '       in .env.local and in Vercel, or the deployed console will keep failing.'
    );
    return sql;
  }
}

/** Push the NDJSON through wrtt.load_990_batch in chunks. */
async function load(outFile) {
  const url = process.env.WRTT_DATABASE_URL;
  if (!url) {
    console.error(
      '[wrtt] no WRTT_DATABASE_URL found in the environment or in .env.local.\n' +
      '       Copy it from Supabase -> Connect -> Session pooler (verbatim; the\n' +
      '       aws-0 / aws-1 prefix differs per project) into .env.local as:\n\n' +
      '         WRTT_DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres\n'
    );
    process.exit(1);
  }
  const sql = await connect(url);

  const raw = outFile.endsWith('.gz')
    ? (await import('node:zlib')).gunzipSync(await fsp.readFile(outFile)).toString('utf8')
    : await fsp.readFile(outFile, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  if (!lines.length) {
    console.error(`[wrtt] ${outFile} decoded to no records. Re-fetch it - on Windows a`);
    console.error('       checkout can mangle the archive if it is treated as text.');
    process.exit(1);
  }
  const CHUNK = 200;
  let orgs = 0, people = 0, affs = 0;

  for (let i = 0; i < lines.length; i += CHUNK) {
    const batch = lines.slice(i, i + CHUNK).map((l) => JSON.parse(l));

    // sql.json() tags the parameter as jsonb (oid 3802) explicitly. Passing a
    // pre-stringified array and casting with ::jsonb leaves the parameter type
    // unspecified, and the value can reach the function as a jsonb *string*
    // rather than an array - which fails inside load_990_batch as
    // "cannot extract elements from a scalar" (SQLSTATE 22023), pointing at
    // the SQL rather than at the call site that caused it.
    let row;
    try {
      [row] = await sql`select * from wrtt.load_990_batch(${sql.json(batch)})`;
    } catch (e) {
      if (e.code === '22023') {
        console.error(
          `[wrtt] the batch reached Postgres as a JSON scalar, not an array.\n` +
          `       First 120 chars of what was sent:\n         ` +
          JSON.stringify(batch).slice(0, 120)
        );
      }
      throw e;
    }
    orgs += row.organizations; people += row.people; affs += row.affiliations;
    console.log(`[wrtt] loaded ${Math.min(i + CHUNK, lines.length)}/${lines.length} filings`);
  }
  console.log(`[wrtt] loaded – ${orgs} orgs, ${people} new people, ${affs} affiliations`);

  if (process.argv.includes('--score')) {
    const markets = await sql`select id, name from wrtt.market order by name`;
    for (const m of markets) {
      await sql`select wrtt.run_scoring(${m.id})`;
      const [{ n }] = await sql`
        select count(*)::int as n from wrtt.score s
        join wrtt.score_run r on r.id = s.score_run_id
        where r.market_id = ${m.id}
          and r.run_at = (select max(run_at) from wrtt.score_run where market_id = ${m.id})`;
      console.log(`[wrtt] scored ${m.name}: ${n} candidates`);
    }
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
