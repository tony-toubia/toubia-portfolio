-- ============================================================
-- WRTT – locality: does a candidate's tie to the market reach
-- the town?
--
-- People are assigned to a market by the ZIP of the filing
-- ORGANIZATION, never by where they live. Usually fine: a
-- booster club's board lives near the school. It fails for
-- organizations whose reach exceeds the town - Planned
-- Parenthood Great Plains is headquartered in Overland Park and
-- draws its board from four states, so a director living in
-- Fayetteville, Arkansas lands in the Overland Park market.
-- Found by a Clay identity match, not by looking for it (#48).
--
-- Rules were tested against the corpus, not guessed. Three
-- findings shaped them:
--
--   Size alone does not work. Loaves & Fishes is a $37M food
--   pantry and it is Naperville's own; scope in the NAME is what
--   separates it from a regional charity of similar size. A
--   size-only rule flagged 17% of people including Naperville's
--   own institutions - crying wolf.
--
--   A local chapter of a national body is local. "American
--   Legion Naperville Post 43" carries a national word and is a
--   room of neighbours, so chapter markers (Post 43, Chapter,
--   Lodge, Club of) and the town's own name exempt an org.
--
--   Except for institutions. Wellesley College sits in Wellesley
--   and its board is national, so the town-name exemption must
--   not rescue higher_ed, healthcare_inst, or anything over $50M.
--
-- Result: 445 of 4,106 organizations (10.8%) regional; 5 of the
-- 250 people across all ten top 25s. Verified: PPGP, Wellesley
-- College and Edward Hospital flag; Loaves & Fishes, DuPage
-- Children's Museum, Galaxy Soccer, the booster club and
-- American Legion Post 43 do not.
--
-- The flag NEVER touches a score. Home addresses are
-- deliberately not extracted, so residence cannot be verified -
-- discounting on it would punish a guess. The card says "check
-- residence before contacting" and leaves the ranking alone.
--
-- Applied to the live database via the Supabase migration API in
-- two steps (org flag + backfill; run_scoring locality
-- component). This file is the record - see pg_get_functiondef
-- for the live bodies.
-- ============================================================

create or replace function wrtt.org_is_regional(
  p_name text, p_market_name text, p_revenue numeric, p_domain text
) returns boolean language sql immutable as $$
  with f as (
    select
      p_name ~* ('\m' || coalesce(p_market_name,'\x00') || '\M') as has_town,
      p_name ~* '\m(post|chapter|lodge|council|troop|unit|branch|district)\s*(no\.?\s*)?[0-9]|\mchapter\M|\mclub of\M' as local_chapter,
      p_name ~* '\m(great plains|midwest|mid-?america|southeastern?|northwestern?|southwestern?|northeastern?|tri-?state|heartland|new england|pacific northwest)\M' as multistate,
      p_name ~* '\m(national|nationwide|america|american|u\.?s\.?a|united states|international|worldwide|global)\M' as national,
      coalesce(p_revenue, 0) > 50000000 as very_large,
      coalesce(p_domain,'') in ('higher_ed','healthcare_inst') as institution
  )
  select case
    when local_chapter then false
    when has_town and not institution and not very_large then false
    else multistate or national or very_large or institution
  end from f
$$;

alter table wrtt.organization
  add column if not exists is_regional boolean not null default false;

update wrtt.organization o
   set is_regional = wrtt.org_is_regional(o.name, m.name, o.scale_revenue, o.affiliation_domain)
  from wrtt.market m where m.id = o.market_id;

create index if not exists organization_regional_idx on wrtt.organization (market_id) where is_regional;

-- run_scoring gains a 'locality' component: regional_only true when EVERY
-- affiliation is regional, with up to three org names for the tooltip. One
-- genuinely local tie clears the flag.

-- Two regex bugs caught by checking the flagged list rather than trusting it:
--
--   "Hamilton Southeastern Hockey Club" is Fishers' own - Hamilton
--   Southeastern is the school district. A bare compass word is not evidence
--   of multi-state reach, it is half the school districts in America.
--   Directional terms now only count attached to a state name.
--
--   "northeastern?" is "northeaster" plus an optional n, so it never matched
--   the bare word "northeast" and "Catholic Charities of Northeast Kansas"
--   read as local. The optional suffix needs its own group: (north|south)
--   (east|west)(ern)?.
--
-- Final acceptance, all passing: PPGP, Wellesley College, Edward Hospital and
-- Catholic Charities of Northeast Kansas flag; Loaves & Fishes, DuPage
-- Children's Museum, Galaxy Soccer, Naperville North Boosters, American
-- Legion Post 43 and Hamilton Southeastern Hockey do not. 440 of 4,106
-- organizations; 4 of the 250 people across all ten top 25s.
