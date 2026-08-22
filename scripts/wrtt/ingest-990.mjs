#!/usr/bin/env node
/**
 * WRTT — IRS Form 990 Part VII ingestion.
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
 *   node scripts/wrtt/ingest-990.mjs --years 2024,2025 --load
 *   node scripts/wrtt/ingest-990.mjs --years 2024 --zips 66206,66209 --limit 1
 *
 * Flags:
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
import { XMLParser } from 'fast-xml-parser';

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

/** Scrape the IRS download page rather than guessing URL patterns — the
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

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

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
      snippet: `${person.trim()} — ${String(title).trim() || 'no title given'}`.slice(0, 300),
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
    tax_year: ret.ReturnHeader?.TaxYr ? Number(ret.ReturnHeader.TaxYr) : null,
    source_url: url,
    extractor_version: EXTRACTOR_VERSION,
    people,
  };
}

async function main() {
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
  console.log(`[wrtt] done — ${kept} in-market filings, ${officers} named officers -> ${outFile}`);

  if (process.argv.includes('--load')) await load(outFile);
}

/** Push the NDJSON through wrtt.load_990_batch in chunks. */
async function load(outFile) {
  const url = process.env.WRTT_DATABASE_URL;
  if (!url) {
    console.error('[wrtt] --load needs WRTT_DATABASE_URL. See .env.example.');
    process.exit(1);
  }
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });

  const lines = (await fsp.readFile(outFile, 'utf8')).split('\n').filter(Boolean);
  const CHUNK = 200;
  let orgs = 0, people = 0, affs = 0;

  for (let i = 0; i < lines.length; i += CHUNK) {
    const batch = lines.slice(i, i + CHUNK).map((l) => JSON.parse(l));
    const [row] = await sql`select * from wrtt.load_990_batch(${JSON.stringify(batch)}::jsonb)`;
    orgs += row.organizations; people += row.people; affs += row.affiliations;
    console.log(`[wrtt] loaded ${Math.min(i + CHUNK, lines.length)}/${lines.length} filings`);
  }
  console.log(`[wrtt] loaded — ${orgs} orgs, ${people} new people, ${affs} affiliations`);

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
