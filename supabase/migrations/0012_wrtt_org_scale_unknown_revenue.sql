-- org_scale could never return its own fallback.
--
-- The intent was that an organization whose revenue we do not know contributes
-- a small fixed amount rather than nothing. The implementation read
--
--   ln(greatest(coalesce(revenue, 0), 1)) / divisor
--
-- and ln(1) is 0, so an unknown revenue and a revenue of zero both scored 0 -
-- and multiplied every role at that organization down to nothing. 287 of 1,355
-- organizations, 21% of the corpus, were contributing exactly zero to
-- Mobilization for their officers. It also would have zeroed every 990-N filer,
-- which reports no revenue figure at all by definition.
--
-- Unknown now branches before the logarithm.
create or replace function wrtt.org_scale(revenue numeric, confidence real, divisor real)
returns real language sql immutable as $$
  select least(1.0,
    (case when revenue is null then 0.3
          else ln(greatest(revenue, 1)) / greatest(divisor, 1.0) end)
    * greatest(coalesce(confidence, 0.4), 0.3))::real
$$;
