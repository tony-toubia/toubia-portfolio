-- ============================================================
-- WRTT – load a market corpus straight from a URL.
--
-- Adding markets used to mean running the extractor on a machine
-- that holds WRTT_DATABASE_URL. That is fine when someone is sitting
-- at that machine and a dead end otherwise - and relaying 5MB of
-- officer rosters through an API one chunk at a time works but is
-- absurd. The corpus is checked into a public repository anyway, so
-- Postgres can fetch it itself:
--
--   select * from wrtt.load_from_url(
--     'https://raw.githubusercontent.com/<owner>/<repo>/<ref>/data/990-targets.ndjson');
--
-- Batching matters. 3,134 filings in a single load_990_batch call is
-- a long transaction, and this is the same loader that once died on a
-- statement timeout; batches of ~1,000 finish comfortably.
--
-- Requires the http extension, created here. Note this gives the
-- database outbound HTTP - it is only ever called with a URL chosen
-- by whoever runs the load, never with one from the data.
--
-- Applied to the live database via the Supabase migration API; this
-- file is the record.
-- ============================================================

create extension if not exists http with schema extensions;

create or replace function wrtt.load_from_url(p_url text, p_batch int default 1000)
returns table(filings int, organizations int, people int, affiliations int)
language plpgsql as $$
declare
  v_status int; v_body text;
  v_recs jsonb; v_total int; v_i int := 0;
  v_chunk jsonb; r record;
  n_f int := 0; n_o int := 0; n_p int := 0; n_a int := 0;
begin
  select status, content into v_status, v_body from extensions.http_get(p_url);
  if v_status <> 200 then
    raise exception 'fetching % returned %', p_url, v_status;
  end if;

  -- NDJSON: one filing per line, blank lines tolerated.
  select jsonb_agg(line::jsonb) into v_recs
    from unnest(string_to_array(v_body, E'\n')) as line
   where length(trim(line)) > 0;

  v_total := coalesce(jsonb_array_length(v_recs), 0);
  if v_total = 0 then raise exception '% decoded to no records', p_url; end if;

  while v_i < v_total loop
    select jsonb_agg(e) into v_chunk
      from jsonb_array_elements(v_recs) with ordinality t(e, ord)
     where t.ord > v_i and t.ord <= v_i + p_batch;

    select * into r from wrtt.load_990_batch(v_chunk);
    n_o := n_o + r.organizations; n_p := n_p + r.people; n_a := n_a + r.affiliations;
    n_f := n_f + jsonb_array_length(v_chunk);
    v_i := v_i + p_batch;
  end loop;

  return query select n_f, n_o, n_p, n_a;
end $$;
