-- ============================================================
-- WRTT - employer and occupation from FEC individual contributions.
--
-- Every contact vendor we have tried wants a work identity: an employer
-- domain, a LinkedIn URL, a work email. We hold a name, a town and a
-- volunteer board seat. Clay returned 2 matches from 62 people because it
-- is a B2B tool being asked a consumer-identity question; LinkedIn search
-- reached 5 of 22 and every one of them was a lawyer, a banker or a
-- development professional - the establishment skew the scoring model
-- exists to remove.
--
-- FEC itemised contributions carry name, city, state, zip, EMPLOYER and
-- OCCUPATION. That is the join key we are missing, and it is public
-- disclosure data rather than anything licensed or scraped.
--
-- WHAT IS DELIBERATELY ABSENT
--
-- The same filings say who each person gave to, how much, and in which
-- primary. None of it is here. No committee id, no amount, no party
-- indicator, no memo text - the extractor drops those columns inside the
-- download pipe, so they never reach a file or this database. Using a
-- disclosure file as an employer directory is a different act from
-- building a political profile of a youth soccer coach, and the schema
-- should make the second one impossible rather than merely frowned upon.
--
-- Staging is a table rather than a function argument because the match is
-- the interesting part and it will be wrong at first. Keeping the donor
-- rows lets the join be re-run and audited as the rules improve, instead
-- of re-downloading 4GB to try a different comparison.
-- ============================================================

create table if not exists wrtt.fec_donor (
  id          uuid primary key default gen_random_uuid(),
  surname     text not null,
  forename    text not null,
  city        text,
  state       text,
  zip         text not null,
  market_name text,
  employer    text not null,
  occupation  text not null,
  as_of       int,                -- YYYYMMDD of the most recent filing seen
  cycles      text[],
  loaded_at   timestamptz not null default now(),
  unique (surname, forename, zip)
);

comment on table wrtt.fec_donor is
  'Staged FEC itemised-contribution identities: name, place, employer, occupation. '
  'No committee, amount, party or memo field is stored - this is an employer '
  'directory, not a contribution history.';

create index if not exists fec_donor_match_idx on wrtt.fec_donor (surname, forename);
create index if not exists fec_donor_market_idx on wrtt.fec_donor (market_name);

-- ── Forename agreement ──────────────────────────────────────
-- People do not file their taxes under the name they use anywhere else.
-- GEOFFREY ROEHLL donates as GEOFFREY and appears on LinkedIn as geoff.
-- Prefix agreement covers most of it; the table covers nicknames that
-- share no prefix at all. Same rule the LinkedIn matcher uses, kept here
-- so both paths agree on what counts as the same person.
create table if not exists wrtt.forename_alias (
  formal text not null,
  alias  text not null,
  primary key (formal, alias)
);

insert into wrtt.forename_alias (formal, alias) values
  ('ROBERT','BOB'),('ROBERT','ROB'),('ROBERT','BOBBY'),
  ('WILLIAM','BILL'),('WILLIAM','WILL'),('WILLIAM','BILLY'),
  ('RICHARD','DICK'),('RICHARD','RICK'),('RICHARD','RICH'),
  ('JOHN','JACK'),('JOHN','JOHNNY'),
  ('MARGARET','PEGGY'),('MARGARET','MAGGIE'),('MARGARET','MEG'),
  ('ANTHONY','TONY'),('CHARLES','CHUCK'),('CHARLES','CHARLIE'),
  ('JAMES','JIM'),('JAMES','JIMMY'),
  ('EDWARD','ED'),('EDWARD','TED'),('EDWARD','EDDIE'),
  ('HENRY','HANK'),('HENRY','HARRY'),('LAWRENCE','LARRY'),
  ('ELIZABETH','LIZ'),('ELIZABETH','BETH'),('ELIZABETH','BETSY'),('ELIZABETH','BETTY'),
  ('PATRICIA','PAT'),('PATRICIA','PATTY'),('PATRICIA','TRISH'),
  ('KATHERINE','KATE'),('KATHERINE','KATHY'),('KATHERINE','KATIE'),
  ('CATHERINE','KATE'),('CATHERINE','CATHY'),
  ('SUSAN','SUE'),('SUSAN','SUZY'),('THEODORE','TED'),('FRANCIS','FRANK'),
  ('JOSEPH','JOE'),('JOSEPH','JOEY'),('MICHAEL','MIKE'),('THOMAS','TOM'),
  ('DANIEL','DAN'),('DANIEL','DANNY'),('STEPHEN','STEVE'),('STEVEN','STEVE'),
  ('DEBORAH','DEBBIE'),('DEBORAH','DEB'),('JENNIFER','JEN'),('JENNIFER','JENNY'),
  ('BARBARA','BARB'),('SANDRA','SANDY'),('VIRGINIA','GINNY'),('EUGENE','GENE'),
  ('ALBERT','AL'),('ALEXANDER','ALEX'),('GEOFFREY','GEOFF'),('KIMBERLY','KIM'),
  ('CHRISTOPHER','CHRIS'),('NICHOLAS','NICK'),('BENJAMIN','BEN'),('SAMUEL','SAM'),
  ('MATTHEW','MATT'),('ANDREW','ANDY'),('DOUGLAS','DOUG'),('GREGORY','GREG'),
  ('JEFFREY','JEFF'),('TIMOTHY','TIM'),('RONALD','RON'),('DONALD','DON'),
  ('KENNETH','KEN'),('LAWRENCE','LARS'),('PHILLIP','PHIL'),('PHILIP','PHIL'),
  ('VINCENT','VINCE'),('FREDERICK','FRED'),('MARTIN','MARTY'),('RAYMOND','RAY')
on conflict do nothing;

create or replace function wrtt.forenames_agree(a text, b text)
returns boolean
language sql immutable
as $$
  select a is not null and b is not null and (
       a = b
    or a like b || '%'
    or b like a || '%'
    or exists (select 1 from wrtt.forename_alias f
                where (f.formal = a and f.alias = b) or (f.formal = b and f.alias = a))
    or exists (select 1 from wrtt.forename_alias f1
               join wrtt.forename_alias f2 on f1.formal = f2.formal
               where f1.alias = a and f2.alias = b)
  );
$$;

-- ── Resolved employment ─────────────────────────────────────
create table if not exists wrtt.person_employment (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references wrtt.person(id) on delete cascade,
  employer        text not null,
  occupation      text,
  employer_domain text,
  as_of           int,
  source          text not null,
  source_detail   text,
  confidence      real,
  created_at      timestamptz not null default now(),
  unique (person_id, employer, source)
);

comment on column wrtt.person_employment.employer_domain is
  'Resolved separately. This is the field the contact vendors actually need; '
  'the employer name alone is a search term, a domain is a key.';

create index if not exists person_employment_person_idx on wrtt.person_employment (person_id);

/**
 * Join staged donors to indexed people, and refuse to guess.
 *
 * A match needs the same market, an exact surname and an agreeing forename.
 * Anything that resolves to more than one person on either side is rejected
 * rather than picked from: two Kim Whites in Naperville is the exact shape
 * of the mistake that put a wrong LinkedIn profile into wrtt.contact, and a
 * wrong employer is worse because it looks authoritative and would be handed
 * to a vendor as a lookup key.
 */
create or replace function wrtt.match_fec_employment()
returns table (matched int, ambiguous int)
language plpgsql
as $$
declare
  n_matched int := 0;
  n_ambig   int := 0;
begin
  create temp table _pairs on commit drop as
  select d.id as donor_id, p.id as person_id, d.employer, d.occupation, d.as_of, d.zip
    from wrtt.fec_donor d
    join wrtt.market m  on lower(m.name) = lower(d.market_name)
    join wrtt.person p  on p.market_id = m.id
                       and upper(split_part(p.display_name, ' ', array_length(string_to_array(p.display_name,' '),1)))
                           = d.surname
                       and wrtt.forenames_agree(upper(split_part(p.display_name, ' ', 1)), d.forename)
   where not p.suppressed;

  -- One donor to many people, or one person to many donors: both mean the
  -- name does not identify anybody here. Count them and move on.
  select count(*) into n_ambig from (
    select donor_id from _pairs group by donor_id having count(distinct person_id) > 1
    union all
    select person_id from _pairs group by person_id having count(distinct donor_id) > 1
  ) x;

  with unique_pairs as (
    select * from _pairs
     where donor_id  in (select donor_id  from _pairs group by donor_id  having count(distinct person_id) = 1)
       and person_id in (select person_id from _pairs group by person_id having count(distinct donor_id)  = 1)
  )
  insert into wrtt.person_employment
    (person_id, employer, occupation, as_of, source, source_detail, confidence)
  select u.person_id, u.employer, u.occupation, u.as_of, 'fec_bulk',
         'FEC itemised contribution, zip ' || u.zip || '; employer and occupation only',
         0.80
    from unique_pairs u
  on conflict (person_id, employer, source) do nothing;

  get diagnostics n_matched = row_count;
  return query select n_matched, n_ambig;
end;
$$;

comment on function wrtt.match_fec_employment is
  'Joins wrtt.fec_donor to wrtt.person on market + surname + agreeing forename. '
  'Rejects every many-to-one on either side rather than choosing: a wrong employer '
  'looks authoritative and becomes a vendor lookup key.';

/**
 * Pull the extracted donor file straight into Postgres.
 *
 * Same reasoning as wrtt.load_from_url for the 990 corpus: the alternative is
 * relaying two megabytes of names through a tool call, one chunk at a time.
 * Postgres can fetch it itself, so it does.
 */
create or replace function wrtt.load_fec_from_url(p_url text)
returns table (staged int, skipped int)
language plpgsql
as $$
declare
  v_status int; v_body text; v_recs jsonb;
  n_staged int := 0;
begin
  select status, content into v_status, v_body from extensions.http_get(p_url);
  if v_status <> 200 then
    raise exception 'fetching % returned %', p_url, v_status;
  end if;

  select jsonb_agg(line::jsonb) into v_recs
    from unnest(string_to_array(v_body, E'\n')) as line
   where length(trim(line)) > 0;

  insert into wrtt.fec_donor
    (surname, forename, city, state, zip, market_name, employer, occupation, as_of, cycles)
  select r->>'surname', r->>'forename', r->>'city', r->>'state', r->>'zip',
         r->>'market', r->>'employer', r->>'occupation', (r->>'as_of')::int,
         array(select jsonb_array_elements_text(r->'cycles'))
    from jsonb_array_elements(v_recs) r
  on conflict (surname, forename, zip)
    do update set employer   = excluded.employer,
                  occupation = excluded.occupation,
                  as_of      = greatest(wrtt.fec_donor.as_of, excluded.as_of),
                  cycles     = excluded.cycles
    where excluded.as_of >= wrtt.fec_donor.as_of;

  get diagnostics n_staged = row_count;
  return query select n_staged, coalesce(jsonb_array_length(v_recs),0) - n_staged;
end;
$$;
