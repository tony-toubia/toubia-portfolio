-- ============================================================
-- WRTT – loader for a batch of parsed 990 filings.
--
-- Takes the NDJSON produced by scripts/wrtt/ingest-990.mjs as a jsonb
-- array and lands organizations, people, affiliations and evidence in
-- one transaction. Idempotent: re-running the same batch updates rather
-- than duplicating, so a re-crawl is safe.
-- ============================================================

create or replace function wrtt.load_990_batch(payload jsonb)
returns table (organizations int, people int, affiliations int)
language plpgsql
as $$
declare
  rec        jsonb;
  officer    jsonb;
  v_market   uuid;
  v_org      uuid;
  v_person   uuid;
  v_doc      uuid;
  v_aff      uuid;
  n_org int := 0; n_person int := 0; n_aff int := 0;
begin
  for rec in select * from jsonb_array_elements(payload) loop

    -- Market by ZIP membership. Filings outside every defined market are skipped.
    select m.id into v_market
      from wrtt.market m
     where rec->>'zip' = any (m.zips)
     limit 1;
    continue when v_market is null;

    -- One source_document per filing, keyed by content hash of its URL+EIN.
    insert into wrtt.source_document (source_key, url, content_hash, parse_status)
    values (
      'irs_990',
      rec->>'source_url',
      encode(extensions.digest(coalesce(rec->>'source_url','') || (rec->>'ein'), 'sha256'), 'hex'),
      'parsed'
    )
    on conflict (source_key, content_hash)
      do update set retrieved_at = now(), parse_status = 'parsed'
    returning id into v_doc;

    insert into wrtt.organization (
      name, name_normalized, ein, market_id, affiliation_domain,
      scale_revenue, scale_confidence, city, state, zip
    )
    values (
      rec->>'org_name',
      wrtt.norm_name(rec->>'org_name'),
      rec->>'ein',
      v_market,
      rec->>'affiliation_domain',
      nullif(rec->>'revenue','')::numeric,
      case when rec->>'revenue' is not null then 0.9 else 0.4 end,
      rec->>'city', rec->>'state', rec->>'zip'
    )
    on conflict (ein) do update set
      name               = excluded.name,
      name_normalized    = excluded.name_normalized,
      market_id          = excluded.market_id,
      affiliation_domain = excluded.affiliation_domain,
      scale_revenue      = coalesce(excluded.scale_revenue, wrtt.organization.scale_revenue),
      scale_confidence   = greatest(excluded.scale_confidence, wrtt.organization.scale_confidence)
    returning id into v_org;
    n_org := n_org + 1;

    for officer in select * from jsonb_array_elements(rec->'people') loop

      -- Person identity is (normalized name, market) at load time. Real
      -- cross-source resolution happens in the resolve pass, which can
      -- merge these later; this only prevents duplicates within a market.
      select p.id into v_person
        from wrtt.person p
       where p.market_id = v_market
         and p.name_normalized = wrtt.norm_name(officer->>'name')
       limit 1;

      if v_person is null then
        insert into wrtt.person (
          display_name, name_normalized, surname_block, market_id, first_seen, last_seen
        )
        values (
          officer->>'name',
          wrtt.norm_name(officer->>'name'),
          wrtt.surname_key(officer->>'name'),
          v_market,
          make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 1, 1),
          make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 12, 31)
        )
        returning id into v_person;
        n_person := n_person + 1;
      else
        update wrtt.person set
          first_seen = least(first_seen, make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 1, 1)),
          last_seen  = greatest(last_seen, make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 12, 31))
        where id = v_person;
      end if;

      insert into wrtt.affiliation (
        person_id, organization_id, role_title, role_class,
        hours_per_week, start_date, end_date, confidence
      )
      values (
        v_person, v_org,
        coalesce(nullif(officer->>'title',''), 'unspecified'),
        officer->>'role_class',
        nullif(officer->>'hours','')::numeric,
        make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 1, 1),
        make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 12, 31),
        0.95                              -- federal filing, signed under penalty of perjury
      )
      on conflict (person_id, organization_id, role_title, start_date) do nothing
      returning id into v_aff;

      if v_aff is not null then
        n_aff := n_aff + 1;
        insert into wrtt.evidence (
          subject_type, subject_id, source_document_id, snippet, extractor_version
        )
        values (
          'affiliation', v_aff, v_doc,
          officer->>'snippet',
          rec->>'extractor_version'
        );
      end if;

      v_aff := null;
    end loop;
  end loop;

  return query select n_org, n_person, n_aff;
end;
$$;
