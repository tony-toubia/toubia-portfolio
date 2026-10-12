-- ============================================================
-- WRTT - bind a person to an address on the IRS's authority, not ours.
--
-- The first attempt asked whether each board member lived at the
-- organization's address. It missed 50 times out of 50 and deserved to.
-- EASTLAKE BOYS SELECT BASKETBALL is registered in care of KERI GREENHECK,
-- so asking whether HOLLY AUNGST lives there is asking whether Holly lives
-- at Keri's house. A ten-person board at one member's home yields one true
-- binding and nine false ones, and nothing in the data said which.
--
-- The BMF had the answer the whole time, in a field that was extracted and
-- then ignored: in-care-of names the person whose address it is. Where that
-- name is also someone indexed at that organization, the binding is
-- evidenced rather than inferred - and it is the treasurer or president the
-- club runs out of, who is the person worth reaching anyway.
-- ============================================================

-- A private mailbox is not a house. PMB and bare BOX were missing from the
-- classifier and put 16 rental boxes in the residential queue, where a name
-- can never match. Reclassify in place rather than re-downloading.
update wrtt.organization
   set premises_type = 'commercial'
 where street is not null
   and street ~* '\m(pmb|p\s?m\s?b|box)\M'
   and premises_type <> 'commercial';

create or replace view wrtt.person_address as
  select p.id as person_id, p.display_name, m.name as market, m.state,
         o.id as organization_id, o.name as org,
         o.street, o.city, o.state as addr_state, o.zip, o.premises_type,
         regexp_replace(upper(o.in_care_of), '^[%\s]*(C/?O\s+)?', '') as in_care_of
    from wrtt.organization o
    join wrtt.affiliation a on a.organization_id = o.id
    join wrtt.person p on p.id = a.person_id
    join wrtt.market m on m.id = p.market_id
   cross join lateral wrtt.name_parts(p.display_name) np
   cross join lateral wrtt.name_parts(regexp_replace(upper(o.in_care_of), '^[%\s]*(C/?O\s+)?', '')) ico
   where o.in_care_of is not null
     and o.street is not null and o.city is not null and o.zip is not null
     and not p.suppressed
     -- Compared with the same rules used everywhere else in this schema, so
     -- KIM and KIMBERLY are one person here exactly as in the FEC join.
     and np.surname = ico.surname
     and wrtt.forenames_agree(np.forename, ico.forename);

comment on view wrtt.person_address is
  'People bound to a street address because the IRS Business Master File names '
  'them as the organization''s in-care-of contact. Evidenced, not inferred: the '
  'earlier approach of trying every board member against the org address missed '
  '50 of 50, because the address belongs to whoever is named here and nobody else.';
