#!/usr/bin/env node
/**
 * WRTT – look for candidates on the board pages their organizations publish.
 *
 * The linkage a B2B enrichment index cannot supply is published in plain
 * sight: a nonprofit's own "Board of Directors" page names the volunteers we
 * score, and often gives a way to reach them. Clay returned 2 matches from 62
 * people because its graph is keyed on employment; this reads the primary
 * source instead.
 *
 * Deliberately narrow. It fetches an organization's home page, follows links
 * whose text or href looks like a board, staff, leadership or contact page,
 * and looks on those pages for names we already hold. It does not crawl, does
 * not follow off-site links, and does not read anything a visitor would not
 * see. Everything it reads is a page the organization published about itself.
 *
 * Usage:
 *   node scripts/wrtt/scan-org-sites.mjs --targets <file> --out <file>
 *
 * Flags:
 *   --targets  JSON [{o,u,n,p:[{i,n}]}]     (default data/org-scan-targets.json)
 *   --out      NDJSON of findings           (default data/org-scan.ndjson)
 *   --limit    stop after N organizations   (0 = all)
 *   --conc     organizations in flight      (default 6)
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const UA = 'SLT-Ventures-WRTT/0.1 (+https://slt.ventures/wrtt; research indexing; contact info@slt.ventures)';
const PAGE_TIMEOUT_MS = 12000;
const MAX_SUBPAGES = 5;
const PER_HOST_DELAY_MS = 900;

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Link text or href that suggests a page naming the people in charge. */
const LEADERSHIP_HREF =
  /(board|trustee|director|leadership|staff|team|about|who-?we-?are|our-?people|governance|officers|contact)/i;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Addresses that belong to the site's plumbing rather than a person.
const EMAIL_JUNK =
  /(no-?reply|do-?not-?reply|postmaster|abuse@|webmaster|@example\.|@sentry|@wixpress|@squarespace|\.png$|\.jpg$|\.gif$)/i;

function normalizeUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed;
  } catch { return null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { timeout = PAGE_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return null;
    // Board pages are small; a multi-megabyte response is not one.
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3_000_000) return null;
    return { text: Buffer.from(buf).toString('utf8'), url: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * robots.txt, honoured for our own user-agent and for *. Parsed rather than
 * assumed: a research crawler that ignores robots is not one we should ship.
 * A site with no robots.txt is treated as allowing.
 */
async function robotsFor(origin) {
  const res = await fetchText(origin + '/robots.txt', { timeout: 6000 });
  if (!res) return { disallow: [] };
  const lines = res.text.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const groups = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'user-agent') {
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'disallow' || key === 'allow')) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a === '*' || UA.toLowerCase().startsWith(a)));
  const disallow = mine.flatMap((g) => g.rules.filter((r) => !r.allow && r.path).map((r) => r.path));
  return { disallow };
}

function robotsAllows(robots, pathname) {
  return !robots.disallow.some((rule) => {
    if (rule === '/') return true;
    return pathname.startsWith(rule.replace(/\*$/, ''));
  });
}

/** Strip tags, keeping mailto targets inline so a name and its address stay adjacent. */
function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<a[^>]+href=["']mailto:([^"'?]+)[^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(mdash|ndash|middot|bull|apos|quot|lt|gt|#\d+);/gi, ' ')
    .replace(/\s+/g, ' ');
}

function linksFrom(html, base) {
  const out = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const [, href, label] = m;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, base); } catch { continue; }
    if (abs.origin !== base.origin) continue;                 // never leave the site
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?)$/i.test(abs.pathname)) continue;
    const text = label.replace(/<[^>]+>/g, ' ');
    if (!LEADERSHIP_HREF.test(abs.pathname) && !LEADERSHIP_HREF.test(text)) continue;
    if (!out.has(abs.href)) out.set(abs.href, text.trim().slice(0, 60));
  }
  return [...out.entries()].slice(0, MAX_SUBPAGES);
}

/** Name forms a page might use: "Kim White", "White, Kim", "Kim S. White". */
function nameVariants(full) {
  const parts = full.replace(/[^A-Za-z '-]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0], last = parts[parts.length - 1];
  return [
    `${first} ${last}`,
    `${last}, ${first}`,
    `${first}\\s+\\S\\.?\\s+${last}`,   // middle initial
  ];
}

/**
 * An email is attributed to a person only when it sits near their name AND no
 * other name we are looking for sits between the two. 220 characters is about
 * a table row or a card - close enough that the page is making the
 * association rather than us guessing.
 *
 * The second condition is not fussiness. Without it, a board list of the form
 * "Kim White - kwhite@... Harpreet Chawla - <noreply>" hands Kim's address to
 * Harpreet, because his 220-character window reaches back over hers. Handing
 * one person's email to another is the single worst thing this pass could do.
 */
const PROXIMITY = 220;

/**
 * A roster reads "Name, Title - email", so an address belongs to the name
 * that most recently preceded it. Nearest-by-distance is wrong and quietly
 * dangerous: in "Kim White, President kwhite@... Harpreet Chawla, Secretary"
 * the address is physically nearer to Harpreet than to Kim, and handing one
 * person's email to another is the worst thing this pass could do.
 *
 * Two further guards. Nothing is assigned across more than PROXIMITY
 * characters, and nothing is assigned if any other capitalised name-shaped
 * pair sits between the name and the address - that is somebody we are not
 * looking for, and the address is likelier theirs.
 */
const NAME_SHAPE = /\b[A-Z][a-z]{1,15}\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]{1,15}\b/g;

function locate(text, person) {
  for (const variant of nameVariants(person.n)) {
    const pattern = variant.includes('\\s')
      ? variant
      : variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let m;
    try { m = new RegExp(pattern, 'i').exec(text); } catch { continue; }
    if (m) return m;
  }
  return null;
}

function findOnPage(text, people) {
  const located = [];
  for (const person of people) {
    const m = locate(text, person);
    if (m) located.push({ person, start: m.index, end: m.index + m[0].length, matched: m[0] });
  }
  if (!located.length) return [];
  located.sort((a, b) => a.start - b.start);

  const owner = new Map();               // person id -> chosen address
  for (const e of text.matchAll(EMAIL_RE)) {
    const addr = e[0];
    if (EMAIL_JUNK.test(addr)) continue;
    // The last located name that ends before this address begins.
    let prev = null;
    for (const l of located) {
      if (l.end <= e.index) prev = l; else break;
    }
    if (!prev) continue;
    const gapStart = prev.end, gapEnd = e.index;
    if (gapEnd - gapStart > PROXIMITY) continue;
    const gap = text.slice(gapStart, gapEnd);
    NAME_SHAPE.lastIndex = 0;
    if (NAME_SHAPE.test(gap)) continue;  // an unlisted person stands between
    if (!owner.has(prev.person.i)) owner.set(prev.person.i, { addr, distance: gapEnd - gapStart });
  }

  return located.map((l) => {
    const from = Math.max(0, l.start - PROXIMITY);
    const got = owner.get(l.person.i) ?? null;
    return {
      person_id: l.person.i,
      name: l.person.n,
      matched_as: l.matched,
      email: got?.addr ?? null,
      email_distance: got?.distance ?? null,
      context: text.slice(from, l.start + PROXIMITY).replace(/\s+/g, ' ').trim().slice(0, 240),
    };
  });
}

async function scanOrg(target) {
  const base = normalizeUrl(target.u);
  if (!base) return { org: target.o, status: 'bad_url' };

  const robots = await robotsFor(base.origin);
  if (!robotsAllows(robots, base.pathname || '/')) return { org: target.o, status: 'robots_denied' };

  const home = await fetchText(base.href);
  if (!home) return { org: target.o, status: 'unreachable' };

  const pages = [{ url: home.url, html: home.text }];
  for (const [href] of linksFrom(home.text, base)) {
    let u;
    try { u = new URL(href); } catch { continue; }
    if (!robotsAllows(robots, u.pathname)) continue;
    await sleep(PER_HOST_DELAY_MS);
    const sub = await fetchText(href);
    if (sub) pages.push({ url: sub.url, html: sub.text });
  }

  const findings = [];
  for (const page of pages) {
    const text = toText(page.html);
    for (const hit of findOnPage(text, target.p)) {
      findings.push({ ...hit, page: page.url });
    }
  }

  // One row per person: the best page is the one that also yielded an email.
  const best = new Map();
  for (const f of findings) {
    const prior = best.get(f.person_id);
    if (!prior || (!prior.email && f.email)) best.set(f.person_id, f);
  }

  return {
    org: target.o,
    org_name: target.n,
    site: base.origin,
    status: 'ok',
    pages_read: pages.length,
    findings: [...best.values()],
  };
}

async function main() {
  const targetsFile = arg('--targets', 'data/org-scan-targets.json');
  const outFile = arg('--out', 'data/org-scan.ndjson');
  const limit = Number(arg('--limit', '0')) || 0;
  const conc = Number(arg('--conc', '6')) || 6;

  let targets = JSON.parse(await fsp.readFile(targetsFile, 'utf8'));
  if (limit) targets = targets.slice(0, limit);
  console.log(`[wrtt-web] ${targets.length} organizations, concurrency ${conc}`);

  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const out = fs.createWriteStream(outFile, { flags: 'w' });

  const tally = { ok: 0, unreachable: 0, robots_denied: 0, bad_url: 0, named: 0, emails: 0 };
  let cursor = 0, done = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const r = await scanOrg(targets[i]).catch(() => ({ org: targets[i].o, status: 'error' }));
      tally[r.status] = (tally[r.status] ?? 0) + 1;
      if (r.findings?.length) {
        tally.named += r.findings.length;
        tally.emails += r.findings.filter((f) => f.email).length;
        out.write(JSON.stringify(r) + '\n');
      }
      if (++done % 25 === 0) {
        console.log(`[wrtt-web] ${done}/${targets.length}  named=${tally.named} emails=${tally.emails} ` +
                    `ok=${tally.ok} unreachable=${tally.unreachable} robots=${tally.robots_denied}`);
      }
    }
  }

  await Promise.all(Array.from({ length: conc }, worker));
  out.end();
  await new Promise((r) => out.on('finish', r));

  console.log(`[wrtt-web] done – ${tally.named} people found by name, ${tally.emails} with an email`);
  console.log(`[wrtt-web] sites: ok ${tally.ok}, unreachable ${tally.unreachable}, ` +
              `robots ${tally.robots_denied}, bad url ${tally.bad_url ?? 0}`);
  console.log(`[wrtt-web] -> ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
