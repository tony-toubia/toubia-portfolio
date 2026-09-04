import { cookies } from 'next/headers';
import { getMarket, getResearchRows, isConfigured } from '@/lib/wrtt/db';
import { ADMIN_COOKIE } from '../../profile/constants';

/**
 * The contact-research worksheet, as CSV.
 *
 * Admin-gated rather than gate-gated. The console password is shared with
 * whoever is being shown the index; a ranked list of named private individuals
 * packaged for outreach is a different thing from a page about methodology,
 * and should not fall out of the same password.
 *
 * Filled columns are the public filing record. Blank columns are what the
 * researcher adds - and they are deliberately shaped like wrtt.contact, so a
 * finished sheet imports without anyone having to reconcile column names.
 */

export const dynamic = 'force-dynamic';

const HEADERS = [
  'person_id', 'rank', 'name', 'score', 'confidence', 'market', 'state',
  'tenure', 'domains', 'roles', 'org_phones', 'org_sites',
  // Whether every organization tying this person to the market reaches
  // beyond it. When yes, residence is the first thing to check.
  'regional_only', 'regional_orgs',
  // Pages that already name this person on an organization's own site.
  'found_on',
  // ── researcher fills these in ──
  'lives_in_market', 'email', 'phone', 'linkedin', 'mailing',
  'source', 'source_detail', 'match_confidence', 'verified_by', 'status', 'notes',
];

/** RFC 4180: quote everything, double any embedded quote. Excel-safe. */
function csv(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ market: string }> },
) {
  const token = process.env.WRTT_ADMIN_TOKEN;
  const jar = await cookies();
  if (!token || jar.get(ADMIN_COOKIE)?.value !== token) {
    return new Response('Admin token required. Unlock on /slt/wrtt/profile first.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  if (!isConfigured) return new Response('Not connected.', { status: 503 });

  const { market: marketId } = await params;
  const market = await getMarket(marketId);
  if (!market) return new Response('No such market.', { status: 404 });

  const url = new URL(_req.url);
  const limit = Math.min(Number(url.searchParams.get('n') ?? 25) || 25, 200);
  const rows = await getResearchRows(marketId, limit);

  const body = [
    HEADERS.join(','),
    ...rows.map((r) => [
      r.person_id, r.rank_in_market, r.display_name, r.wrtt_score, r.confidence,
      r.market, r.state, r.tenure, r.domains, r.roles, r.org_phones, r.org_sites,
      r.regional_only ? 'CHECK RESIDENCE' : '', r.regional_orgs, r.found_on,
      '', '', '', '', '', '', '', '', '', '', '',
    ].map(csv).join(',')),
  ].join('\r\n');

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="wrtt-${marketId}-top${limit}-${stamp}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
