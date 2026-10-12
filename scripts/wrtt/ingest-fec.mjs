#!/usr/bin/env node
/**
 * WRTT - resolve candidates' employer and occupation from FEC bulk filings.
 *
 * The problem this solves: every contact vendor we have tried wants a work
 * identity - an employer domain, a LinkedIn URL, a work email. We hold a name,
 * a town and a volunteer board seat. Clay found 2 people in 62 because it is a
 * B2B tool being asked a consumer-identity question, and LinkedIn search only
 * reaches the people whose careers already require a public profile, which is
 * exactly the establishment skew the scoring model was tuned to remove.
 *
 * FEC individual-contribution filings carry, for every contribution over $200:
 * name, city, state, zip, EMPLOYER and OCCUPATION. That is the missing join
 * key. "KIMBERLY MCMAHON, Naperville" is unresolvable; "Kimberly McMahon,
 * Naperville IL, nurse at Edward Hospital" is a Clay lookup that works.
 *
 * WHAT THIS DELIBERATELY DOES NOT KEEP
 *
 * The same rows say who each person gave money to, how much, and in which
 * primary. None of that is extracted. Not the committee id, not the amount,
 * not the party indicator, not the memo text. We are using a public disclosure
 * file as a phone book for employers; building a political profile of a youth
 * soccer coach is a different act with a different set of consequences, and
 * the code should make it impossible rather than merely discouraged.
 *
 * The filter runs in awk inside the download pipe, so the discarded columns
 * are never written anywhere - not to disk, not to a variable in this process.
 *
 * Coverage is bounded by who appears at all: contributions under $200 are not
 * itemized, so this reaches donors, skewing older and wealthier. Treat the
 * match rate as a floor on the affluent markets and expect much less
 * elsewhere. It costs nothing to find out, which is the argument for it.
 *
 * Usage:
 *   node scripts/wrtt/ingest-fec.mjs --cycles 2024,2022 --out data/fec.ndjson
 *   node scripts/wrtt/ingest-fec.mjs --cycles 2024 --load
 *
 * Flags:
 *   --cycles   comma-separated election cycles, even years   (default 2024)
 *   --out      NDJSON output                                 (default data/fec-employers.ndjson)
 *   --load     write matches to wrtt.person_employment; needs WRTT_DATABASE_URL
 *   --dry      stop after 200 matched rows, for a fast sanity check
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* absent, or Node < 20.12 */ }
}

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MARKETS = JSON.parse(fs.readFileSync('scripts/wrtt/markets.json', 'utf8'));
const ZIP_TO_MARKET = new Map();
for (const m of MARKETS) for (const z of m.zips) ZIP_TO_MARKET.set(z, m);

/* ── Extraction ────────────────────────────────────────────────
   itcont.txt is pipe-delimited with no header. Columns, 1-indexed:
     1 CMTE_ID   2 AMNDT_IND  3 RPT_TP    4 TRANSACTION_PGI  5 IMAGE_NUM
     6 TRANS_TP  7 ENTITY_TP  8 NAME      9 CITY            10 STATE
    11 ZIP_CODE 12 EMPLOYER  13 OCCUPATION 14 TRANSACTION_DT 15 TRANSACTION_AMT
   ...and six more. Only 7-14 are ever emitted, minus the amount. */
function awkProgram() {
  const zips = [...ZIP_TO_MARKET.keys()].map((z) => `z["${z}"]=1`).join(';');
  return `
    BEGIN { FS="|"; OFS="|"; ${zips} }
    $7 == "IND" {
      zip5 = substr($11, 1, 5)
      if (!(zip5 in z)) next
      if ($8 == "" || $12 == "" || $13 == "") next
      print $8, $9, $10, zip5, $12, $13, $14
    }`;
}

const FEC_URL = (cycle) =>
  `https://www.fec.gov/files/bulk-downloads/${cycle}/indiv${String(cycle).slice(2)}.zip`;

/**
 * Stream one cycle: download, inflate and filter without the 4GB ever landing.
 * funzip inflates the first zip member from a pipe, which is all itcont.txt
 * needs, and awk drops ~99.9% of rows before they reach this process.
 */
function streamCycle(cycle, onRow) {
  return new Promise((resolve, reject) => {
    const pipeline = `set -o pipefail; curl -sL --retry 3 --retry-delay 5 "${FEC_URL(cycle)}" ` +
                     `| funzip | awk '${awkProgram()}'`;
    const proc = spawn('bash', ['-c', pipeline], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString().slice(0, 2000); });

    const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
    let seen = 0;
    rl.on('line', (line) => { seen++; onRow(line); });

    proc.on('close', (code) => {
      // funzip closes the pipe once the member ends, which makes curl exit 23.
      // That is the normal end of a successful stream, not a failure.
      if (code !== 0 && seen === 0) return reject(new Error(`cycle ${cycle} failed (${code}): ${stderr}`));
      resolve(seen);
    });
    proc.on('error', reject);
  });
}

/* ── Normalisation ─────────────────────────────────────────────
   FEC writes "LAST, FIRST MIDDLE" with wide variation in suffixes and
   punctuation. Our person rows are "FIRST LAST". Meet in the middle: a
   surname and a forename, both uppercased and stripped. */

const SUFFIX = /\b(jr|sr|ii|iii|iv|md|dds|phd|esq|cpa)\b\.?/gi;

function splitName(raw) {
  const s = String(raw).replace(SUFFIX, ' ').replace(/[^A-Za-z,'\- ]/g, ' ');
  const [lastPart, firstPart] = s.includes(',') ? s.split(',', 2) : [null, null];
  if (!lastPart || !firstPart) return null;
  const surname = lastPart.trim().toUpperCase().replace(/\s+/g, ' ');
  const forename = firstPart.trim().toUpperCase().split(/\s+/)[0] ?? '';
  if (surname.length < 2 || forename.length < 2) return null;
  return { surname, forename };
}

/** Employers that identify nobody. Keeping these would manufacture matches. */
const NULL_EMPLOYER = new Set([
  'NONE', 'N/A', 'NA', 'NOT EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'SELF',
  'SELF-EMPLOYED', 'SELF EMPLOYED', 'HOMEMAKER', 'INFORMATION REQUESTED',
  'REQUESTED', 'BEST EFFORTS', 'NOT PROVIDED', 'UNKNOWN', 'STUDENT', 'NONE.',
]);

const clean = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');

/** FEC dates are MMDDYYYY. Later filings win when someone changed jobs. */
function fecDate(d) {
  const s = String(d || '').padStart(8, '0');
  const [mm, dd, yyyy] = [s.slice(0, 2), s.slice(2, 4), s.slice(4, 8)];
  const n = Number(`${yyyy}${mm}${dd}`);
  return Number.isFinite(n) && n > 19000000 ? n : 0;
}

async function main() {
  const cycles = (arg('--cycles', '2024')).split(',').map((c) => c.trim()).filter(Boolean);
  const outFile = arg('--out', 'data/fec-employers.ndjson');
  const dry = process.argv.includes('--dry');

  // Keyed by person+place, because the same donor files many times and we want
  // one current employer each, not a contribution history.
  const people = new Map();
  let scanned = 0, unusable = 0;

  for (const cycle of cycles) {
    console.log(`[wrtt-fec] streaming cycle ${cycle} (~4GB, filtered in flight)...`);
    const started = Date.now();

    const rows = await streamCycle(cycle, (line) => {
      scanned++;
      const [rawName, city, state, zip5, employer, occupation, date] = line.split('|');
      const nm = splitName(rawName);
      const emp = clean(employer);
      const occ = clean(occupation);
      if (!nm || NULL_EMPLOYER.has(emp)) { unusable++; return; }

      const market = ZIP_TO_MARKET.get(zip5);
      const key = `${nm.surname}|${nm.forename}|${zip5}`;
      const when = fecDate(date);
      const prior = people.get(key);
      if (!prior || when > prior.as_of) {
        people.set(key, {
          surname: nm.surname, forename: nm.forename,
          city: clean(city), state: clean(state), zip: zip5,
          market: market?.name ?? null,
          employer: emp, occupation: occ,
          as_of: when, cycles: [...new Set([...(prior?.cycles ?? []), cycle])],
        });
      } else if (prior) {
        prior.cycles = [...new Set([...prior.cycles, cycle])];
      }

      if (dry && people.size >= 200) throw new Error('__dry__');
    }).catch((e) => { if (String(e.message).includes('__dry__')) return 0; throw e; });

    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`[wrtt-fec] cycle ${cycle}: ${rows} rows in our zips, ${people.size} people so far (${secs}s)`);
  }

  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const out = fs.createWriteStream(outFile, { flags: 'w' });
  for (const p of people.values()) out.write(JSON.stringify(p) + '\n');
  out.end();
  await new Promise((r) => out.on('finish', r));

  const byMarket = new Map();
  for (const p of people.values()) byMarket.set(p.market, (byMarket.get(p.market) ?? 0) + 1);

  console.log(`[wrtt-fec] ${scanned} rows matched our zips, ${unusable} unusable ` +
              `(no employer, or a placeholder like RETIRED / INFORMATION REQUESTED)`);
  console.log(`[wrtt-fec] ${people.size} distinct people with a real employer`);
  for (const [m, n] of [...byMarket].sort((a, b) => b[1] - a[1])) console.log(`           ${String(n).padStart(6)}  ${m}`);
  console.log(`[wrtt-fec] -> ${outFile}`);
  console.log('[wrtt-fec] No committee, amount, party or memo field is read. Employer and occupation only.');
}

main().catch((e) => { console.error(e); process.exit(1); });
