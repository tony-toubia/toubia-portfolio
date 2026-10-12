#!/usr/bin/env node
/**
 * WRTT - organization street addresses from the IRS Business Master File.
 *
 * Form 990 Part VII gives officers with titles and hours and no address, which
 * is why this index has never held one. The organization's own address is a
 * different thing: it is on every return, it is republished in the BMF, and it
 * is the address a stranger is meant to use to reach the organization.
 *
 * Two things it unlocks:
 *
 *   Mail. A QR-coded piece addressed to "Board President, Galaxy Soccer Club"
 *   at the club's published address is ordinary direct mail, and it reaches
 *   the grassroots organizers that every work-identity vendor has missed.
 *
 *   Identity vendors. AtData's Email Append requires a street; name plus city
 *   and zip is refused. This supplies the missing field.
 *
 * THE PART THAT NEEDS SAYING
 *
 * A small nonprofit is frequently registered at a board member's house. So
 * some of these rows are, in substance, somebody's home address - published by
 * the IRS, but a home address nonetheless. This does not refuse to store them;
 * it flags the ones that look residential so the distinction survives into
 * whatever gets built on top, rather than being flattened into "org data" and
 * forgotten. A suite number or a PO box is evidently not a house. The rest is
 * a heuristic on organization size and is labelled as one, because a string
 * alone cannot actually tell you who sleeps there.
 *
 * Usage:
 *   node scripts/wrtt/ingest-bmf.mjs --out data/bmf-org-addresses.ndjson
 *
 * Flags:
 *   --out    NDJSON output   (default data/bmf-org-addresses.ndjson)
 *   --files  BMF regional files to pull (default eo1,eo2,eo3,eo4)
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MARKETS = JSON.parse(fs.readFileSync('scripts/wrtt/markets.json', 'utf8'));
const ZIPS = new Set(MARKETS.flatMap((m) => m.zips));
const ZIP_TO_MARKET = new Map();
for (const m of MARKETS) for (const z of m.zips) ZIP_TO_MARKET.set(z, m.name);

/** A suite, floor or PO box is plainly not somebody's front door. */
const CLEARLY_COMMERCIAL = /\b(ste|suite|fl|floor|unit\s*[a-z]?\d|p\.?\s?o\.?\s+box|pob|dept|department|bldg|building|rm|room)\b/i;
/** An apartment is a home, and so is a street address with no premises marker. */
const CLEARLY_RESIDENTIAL = /\b(apt|apartment|#\s*\d+[a-z]?$)\b/i;

/**
 * CSV parsing, minimal but correct for quoted fields. The BMF quotes names
 * containing commas, and a naive split puts the street in the city column.
 */
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function streamFile(name, onRow) {
  return new Promise((resolve, reject) => {
    const url = `https://www.irs.gov/pub/irs-soi/${name}.csv`;
    const proc = spawn('bash', ['-c', `curl -sL --retry 3 --retry-delay 5 "${url}"`],
                       { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString().slice(0, 1000); });

    const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
    let n = 0, header = null;
    rl.on('line', (line) => {
      if (!header) { header = parseCsvLine(line); return; }
      n++;
      onRow(parseCsvLine(line), header);
    });
    proc.on('close', (code) => {
      if (code !== 0 && n === 0) return reject(new Error(`${name} failed (${code}): ${stderr}`));
      resolve(n);
    });
    proc.on('error', reject);
  });
}

async function main() {
  const outFile = arg('--out', 'data/bmf-org-addresses.ndjson');
  const files = arg('--files', 'eo1,eo2,eo3,eo4').split(',').map((s) => s.trim());

  const rows = new Map();     // ein -> record
  let scanned = 0;

  for (const f of files) {
    process.stdout.write(`[wrtt-bmf] ${f}.csv ... `);
    const started = Date.now();
    const n = await streamFile(f, (cols, header) => {
      const get = (k) => cols[header.indexOf(k)] ?? '';
      const zip5 = String(get('ZIP')).slice(0, 5);
      if (!ZIPS.has(zip5)) return;

      const street = String(get('STREET')).trim();
      if (!street) return;

      const ein = String(get('EIN')).trim().padStart(9, '0');
      const revenue = Number(get('REVENUE_AMT')) || 0;

      // Ordered most-certain first: an explicit marker beats a size guess.
      const premises =
        CLEARLY_COMMERCIAL.test(street)   ? 'commercial'
        : CLEARLY_RESIDENTIAL.test(street) ? 'residential'
        : revenue > 0 && revenue < 250000  ? 'likely_residential'
        : revenue >= 250000                ? 'likely_commercial'
        : 'unknown';

      rows.set(ein, {
        ein, name: String(get('NAME')).trim(), in_care_of: String(get('ICO')).trim() || null,
        street, city: String(get('CITY')).trim(), state: String(get('STATE')).trim(),
        zip: zip5, market: ZIP_TO_MARKET.get(zip5) ?? null,
        premises, revenue,
      });
    });
    scanned += n;
    console.log(`${n} rows, ${rows.size} in our zips so far (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  }

  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const out = fs.createWriteStream(outFile, { flags: 'w' });
  for (const r of rows.values()) out.write(JSON.stringify(r) + '\n');
  out.end();
  await new Promise((r) => out.on('finish', r));

  const byPremises = new Map();
  for (const r of rows.values()) byPremises.set(r.premises, (byPremises.get(r.premises) ?? 0) + 1);

  console.log(`[wrtt-bmf] scanned ${scanned} exempt organizations, kept ${rows.size} in our markets`);
  for (const [k, v] of [...byPremises].sort((a, b) => b[1] - a[1])) console.log(`           ${String(v).padStart(6)}  ${k}`);
  console.log(`[wrtt-bmf] -> ${outFile}`);
  console.log('[wrtt-bmf] "likely_*" is a size heuristic, not a determination. A string cannot tell you who sleeps there.');
}

main().catch((e) => { console.error(e); process.exit(1); });
