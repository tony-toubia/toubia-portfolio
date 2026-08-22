-- ============================================================
-- WRTT – load compensation and officer kind.
--
-- 0007 added affiliation.compensation and .officer_kind and the
-- scoring that depends on them, but the loader was never taught to
-- write them. Every role stayed NULL, every pay weight came out as
-- "unknown", and the whole point of the change - separating people
-- who volunteer from people who are employed - did nothing at all.
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

    select m.id into v_market
      from wrtt.market m
     where rec->>'zip' = any (m.zips)
     limit 1;
    continue when v_market is null;

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

    -- Domain comes from classify_domain rather than from the payload, so
    -- improving the rules is an UPDATE over existing rows, not a re-ingest.
    insert into wrtt.organization (
      name, name_normalized, ein, market_id, affiliation_domain,
      scale_revenue, scale_confidence, city, state, zip, phone, website
    )
    values (
      rec->>'org_name',
      wrtt.norm_name(rec->>'org_name'),
      rec->>'ein',
      v_market,
      wrtt.classify_domain(rec->>'org_name'),
      nullif(rec->>'revenue','')::numeric,
      case when rec->>'revenue' is not null then 0.9 else 0.4 end,
      rec->>'city', rec->>'state', rec->>'zip',
      nullif(rec->>'phone',''), nullif(rec->>'website','')
    )
    on conflict (ein) do update set
      name               = excluded.name,
      name_normalized    = excluded.name_normalized,
      market_id          = excluded.market_id,
      affiliation_domain = excluded.affiliation_domain,
      scale_revenue      = coalesce(excluded.scale_revenue, wrtt.organization.scale_revenue),
      scale_confidence   = greatest(excluded.scale_confidence, wrtt.organization.scale_confidence),
      -- Keep whatever contact we already had if this filing omitted it.
      phone              = coalesce(excluded.phone,   wrtt.organization.phone),
      website            = coalesce(excluded.website, wrtt.organization.website)
    returning id into v_org;
    n_org := n_org + 1;

    for officer in select * from jsonb_array_elements(rec->'people') loop

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

      -- One row per tenure. A re-filing of the same role widens the date
      -- range and adds evidence; it is not a second affiliation.
      insert into wrtt.affiliation (
        person_id, organization_id, role_title, role_class,
        hours_per_week, compensation, officer_kind,
        start_date, end_date, confidence
      )
      values (
        v_person, v_org,
        coalesce(nullif(officer->>'title',''), 'unspecified'),
        officer->>'role_class',
        nullif(officer->>'hours','')::numeric,
        -- jsonb null and SQL NULL both have to survive as NULL here: absent
        -- means the filing did not report pay, which is not the same as zero.
        (officer->>'compensation')::numeric,
        nullif(officer->>'officer_kind',''),
        make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 1, 1),
        make_date(coalesce(nullif(rec->>'tax_year','')::int, 2024), 12, 31),
        0.95                              -- federal filing, signed under penalty of perjury
      )
      on conflict (person_id, organization_id, role_class) do update set
        role_title     = case when excluded.end_date >= wrtt.affiliation.end_date
                              then excluded.role_title else wrtt.affiliation.role_title end,
        start_date     = least(wrtt.affiliation.start_date, excluded.start_date),
        end_date       = greatest(wrtt.affiliation.end_date, excluded.end_date),
        hours_per_week = coalesce(wrtt.affiliation.hours_per_week, excluded.hours_per_week),
        -- Take the most recent filing's figures rather than the first seen:
        -- a role that started unpaid and became salaried should read as paid.
        compensation   = case when excluded.end_date >= wrtt.affiliation.end_date
                              then coalesce(excluded.compensation, wrtt.affiliation.compensation)
                              else coalesce(wrtt.affiliation.compensation, excluded.compensation) end,
        officer_kind   = case when excluded.end_date >= wrtt.affiliation.end_date
                              then coalesce(excluded.officer_kind, wrtt.affiliation.officer_kind)
                              else coalesce(wrtt.affiliation.officer_kind, excluded.officer_kind) end
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
