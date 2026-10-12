-- ============================================================
-- WRTT - line quality for the phone numbers we already hold.
--
-- 1,854 phone numbers came out of the 990 headers and not one of them has
-- been used. Two things are unknown about every single one, and both have
-- to be answered before anybody dials:
--
--   Is it a mobile or a front desk? The books-in-care-of number is a
--   direct line to a named human, but that human may be answering an
--   office phone or a personal cell, and the outreach that suits each is
--   not the same.
--
--   Does it still ring? Some of these come from 2023 filings.
--
-- AtData's phone verification answers both. It returns line_type, carrier,
-- status and a connectivity score - and nothing else. No name, no address,
-- no email. That is worth stating plainly because it is easy to assume an
-- identity vendor returns identity: this endpoint does not, and the columns
-- below are deliberately shaped so nothing else can be smuggled in.
--
-- THIS IS NOT A DNC SCRUB.
--
-- Line type is not registry status. A number can be a live mobile and sit
-- on the National Do Not Call Registry, and calling it would still be the
-- violation. dnc_checked_at stays null until something actually checks the
-- registry, and wrtt.contactable keeps withholding every phone that lacks
-- it. Verifying a line must not look like clearing it for outreach.
-- ============================================================

alter table wrtt.contact add column if not exists line_type       text;
alter table wrtt.contact add column if not exists line_status     text;
alter table wrtt.contact add column if not exists line_carrier    text;
alter table wrtt.contact add column if not exists line_score      int;
alter table wrtt.contact add column if not exists line_checked_at timestamptz;

comment on column wrtt.contact.line_type is
  'mobile | landline | voip, from the phone-verification vendor. Segments a '
  'personal cell from an organization front desk. NOT a DNC status.';
comment on column wrtt.contact.line_status is
  'live | valid | disconnected | invalid. A 2023 filing can carry a dead number.';
comment on column wrtt.contact.line_checked_at is
  'When line quality was last checked. Deliberately separate from dnc_checked_at: '
  'verifying that a line rings says nothing about whether you are allowed to ring it.';

create index if not exists contact_line_type_idx on wrtt.contact (line_type)
  where line_type is not null;
