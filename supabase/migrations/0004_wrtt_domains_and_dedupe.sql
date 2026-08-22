-- ============================================================
-- WRTT – domain taxonomy, and one affiliation per role rather
-- than one per filing year.
--
-- Two defects showed up as soon as the full corpus was scored:
--
-- 1. A person re-filed in the same role at the same organization
--    got a new affiliation row every tax year. 37.8% of rows were
--    re-filings, so a three-year board seat scored like three board
--    seats and inflated confidence along with it. An affiliation is
--    a tenure; repeat filings are *evidence* of it, which is what
--    the evidence table is for.
--
-- 2. Domain classification lived in the ingest script, so improving
--    it meant re-ingesting. 63% of organizations sat in 'business',
--    which was never a category - it was the fallback for "no rule
--    matched". Breadth counts distinct domains, so for most people
--    it was counting noise.
-- ============================================================

-- ── Domain classification, in SQL so it can be re-run ─────────

create or replace function wrtt.classify_domain(raw text)
returns text language sql immutable as $fn$
  select case
    -- Employer-side entities first: benefit trusts and company clubs carry
    -- "trust"/"club" and would otherwise read as philanthropy or civic. A
    -- seat on one is not community organizing.
    when raw ~* '(veba|welfare trust|benefits? trust|employee.{0,20}(trust|benefit|club|apprec|welfare)|\memployees?\M|credit union|\mllc\M)'
      then 'employer'

    -- Greek-letter chapters and lodges. Two Greek letters in sequence is the
    -- reliable tell; single letters appear in ordinary names.
    when raw ~* '((alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|omicron|sigma|tau|upsilon|phi|chi|psi|omega|rho|nu|mu|xi|pi)\s+(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|omicron|sigma|tau|upsilon|phi|chi|psi|omega|rho|nu|mu|xi|pi))'
      or raw ~* '(fraternit|sororit|house corporation|house association)'
      or raw ~* '(knights of columbus|\melks\M|masons|masonic|odd fellows|\mvfw\M|american legion|veterans of foreign|fraternal order|\mfop\M)'
      then 'fraternal'

    -- Trade and professional bodies before health and civic, so a dental
    -- society is not read as a clinic and a bar association is not civic.
    -- A national trade board seat is much weaker local signal than a PTA one.
    when raw ~* '(bar association|dental (society|association)|medical society|realtor|contractors assoc|manufacturers|wholesalers|dealers assoc|auctioneer|plumbing|insurance|accountant|auditor|actuar|\mtrade\M|licens|accreditation|certification|apartment association|turfgrass|livestock|agri-|agriculture council|freight|petroleum|financial executives|professionals?\M|society of \w+ engineers|state boards|\mboard of\M|syndicate|consortium|officials association|management assoc|\mseminar\M|letter carriers|respiratory|neonatolog|veterinary|\mcfa\M|\mcfp\M|\mirem\M|claims association|auto body|crop insurance|property tax|concrete institute|burglar|small business|business network|business capital|workforce|\mtsanet\M|utilities|transportation manage)'
      then 'professional'

    when raw ~* '(cultural|filipino|bengali|korean|latino|hispanic|colombian|tamizh|samaj|sangam|amigos|\masian\M|heritage|daughters of the american|jain\M|friendship circle)'
      then 'cultural'

    when raw ~* '(little league|fastpitch|volleyball|basketball|hoops|soccer|softball|lacrosse|hockey|\mswim|cheer\M|gymnastic|wrestl|quarterback club|girls on the run|pony club|\mrugby\M|track club|athletic|\myouth\M|\mteens?\M|scouts|home run club|horsemen|paddlesport|baseball|\msluggers\M)'
      then 'youth_sports'

    when raw ~* '(school|\mpta\M|\mpto\M|\mptso\M|parent.{0,3}teacher|parents club|booster|academy|university|college|educat|scholarship|tutor|literacy|early learning|montessori|\malumni\M|robotics|student)'
      then 'education'

    when raw ~* '(animal|rescue|humane|\mpets?\M|\mdogs?\M|coonhound|wildlife|critter|equine|barkaid|menageries)'
      then 'animal_welfare'

    when raw ~* '(hospital|health|clinic|hospice|medical|medicine|cancer|surgery|nursing|therapy|therapist|autism|disabilit|parkinson|breastfeeding|\mpatient|cardio|rhythm|tracheostomy|neuro|counseling|bioethics|chronic pain|pain practice|turner syndrome|fibrillation)'
      then 'health'

    when raw ~* '(food (bank|pantry)|meals on wheels|homeless|housing|habitat for humanity|adoption|foster|orphan|refugee|crisis|domestic violence|safehome|charit|human services|family services|senior living|elderly|poverty|hunger|assistance|outreach|\mchildren\M|\mkids\M|\mchild\M|pregnancy|retirement center|single mom|solo parent|junior league|community center|infant|caring\M)'
      then 'human_services'

    when raw ~* '(ministr|church|parish|congregation|temple|synagogue|mosque|chapel|diocese|catholic|christian|\mchrist\M|jewish|jesus|bible|gospel|worship|evangel|\mmissions?\M|disciple|kingdom|pastor|kollel|kashruth|baptist|methodist|lutheran|presbyterian|shalom|\mfaith\M|agape|abbey|spiritual|\mrevival\M|\mtrinity\M|\mgrace\M|angelorum|signatry)'
      then 'faith'

    when raw ~* '(\marts?\M|arthouse|theat|symphony|orchestra|ballet|museum|music|musik|\mband\M|choir|chorus|\mfilm\M|festival|gallery|dance|quilt|literary|\mtedx|stage company|creative|productions?\M|\msongs?\M|trombone|astronomical)'
      then 'arts'

    when raw ~* '(country club|golf (club|association|course)|hunt club|hunting|rifle club|garden club|aero club|soaring|aviation|yacht|collectors club|\mpga\M|tennis|vespa)'
      then 'social_club'

    when raw ~* '(chamber of commerce|rotary|kiwanis|lions club|optimist|jaycee|civic|\mcity of\M|county|municipal|fire (district|department)|firefighter|police|sheriff|library|historical society|preservation|voter|league of women|downtown|main street|\mvisit \w+|tourism|veteran|\mcouncil\M|coalition|civil liberties|citizens|conservanc|conservation|\mliberty\M|\mhonor\M|nature center|lifesaver)'
      then 'civic'

    when raw ~* '(homes assoc|homes assn|homeowners|\mhoa\M|hoa inc|owner.{0,2}s? assoc|residents|subdivision|neighborhood|perpetual care)'
      then 'neighborhood'

    when raw ~* '(foundation|\mfunds?\M|philanthrop|united way|endowment|\mtrust\M|giving|generosity|\mfndn\M|\mfndtn\M|supporting)'
      then 'philanthropy'

    else 'unclassified'
  end
$fn$;

comment on function wrtt.classify_domain(text) is
  'Coarse domain from an organization name. Rule order is significant: employer and professional bodies are matched before the community categories they would otherwise be mistaken for.';

update wrtt.organization set affiliation_domain = wrtt.classify_domain(name);

-- ── One affiliation per role, not per filing ──────────────────

-- Drop the old key before touching any dates: widening a survivor's
-- start_date collides with a sibling row that has not been deleted yet.
alter table wrtt.affiliation
  drop constraint if exists affiliation_person_id_organization_id_role_title_start_date_key;

-- Survivor per (person, organization, role_class): keep the most recent
-- row so the displayed title is the current one.
create temporary table aff_dedupe as
select a.id,
       first_value(a.id) over (
         partition by a.person_id, a.organization_id, a.role_class
         order by a.start_date desc nulls last, a.id
       ) as keep_id
  from wrtt.affiliation a;

-- Evidence follows the survivor. Every filing that mentioned the role
-- stays attached to it, which is the point: more filings, more evidence.
update wrtt.evidence e
   set subject_id = d.keep_id
  from aff_dedupe d
 where e.subject_type = 'affiliation'
   and e.subject_id = d.id
   and d.id <> d.keep_id;

-- Widen the survivor to the full observed tenure before dropping the rest.
update wrtt.affiliation a
   set start_date     = b.min_start,
       end_date       = b.max_end,
       hours_per_week = coalesce(a.hours_per_week, b.any_hours)
  from (
    select d.keep_id,
           min(x.start_date)      as min_start,
           max(x.end_date)        as max_end,
           max(x.hours_per_week)  as any_hours
      from aff_dedupe d
      join wrtt.affiliation x on x.id = d.id
     group by d.keep_id
  ) b
 where a.id = b.keep_id;

delete from wrtt.affiliation a
 using aff_dedupe d
 where a.id = d.id and d.id <> d.keep_id;

alter table wrtt.affiliation
  add constraint affiliation_person_org_role_key
  unique (person_id, organization_id, role_class);

drop table aff_dedupe;
