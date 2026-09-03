import Link from 'next/link';
import { recordHit } from '@/lib/wrtt/hits';

/**
 * The long-form explanation, moved off the markets page so the listings are
 * the first thing anyone sees. This is reference material: read once, linked
 * from both the markets index and every scouting sheet.
 */

export const metadata = {
  title: 'Method – WRTT Index',
};

// Explicit rather than inferred: recordHit reads request headers only when
// the database is configured, so at build time (no WRTT_DATABASE_URL) this
// page would prerender static and the hit would never fire in production.
export const dynamic = 'force-dynamic';

type Input = {
  code: string;
  name: string;
  weight: string;
  what: string;
  from: string;
  live: boolean;
};

const INPUTS: Input[] = [
  {
    code: 'M',
    name: 'Mobilization',
    weight: '35%',
    live: true,
    what:
      'How much leading someone actually does. Every role they hold is weighted by seniority – founder, president and chair count full, an officer or committee chair somewhat less, a listed member or volunteer counts little – then scaled by how big the organization is, faded by how long ago it was, and cut sharply if the role was paid.',
    from: 'Officer rosters on Forms 990, 990-EZ and 990-PF; principal officers on 990-N',
  },
  {
    code: 'B',
    name: 'Breadth',
    weight: '20%',
    live: true,
    what:
      'How many different worlds they move in. Someone who chairs a school foundation, sits on a chamber board and runs a youth league reaches three separate crowds. Someone with three roles inside one church reaches one. Only leadership-grade roles count here.',
    from: 'Organization type, counted once per organizational family',
  },
  {
    code: 'T',
    name: 'Tenure',
    weight: '15%',
    live: true,
    what:
      'How long they have been at it locally, measured from first to most recent appearance and capped at fifteen years. Long tenure is a proxy for the thing that actually matters and cannot be observed directly: that the town trusts them.',
    from: 'Span between earliest and latest filing they appear in; a 990-N gives only one year',
  },
  {
    code: 'R',
    name: 'Reach',
    weight: '12%',
    live: false,
    what:
      'Audience they can address directly – newsletter lists, following, speaking slots. Needs a licensed source, so it is deliberately out of this POC.',
    from: 'No input in this run',
  },
  {
    code: 'A',
    name: 'Availability',
    weight: '10%',
    live: false,
    what:
      'Signals that someone has bandwidth or is at a transition point. Inferring this from public data is the part most likely to be wrong about a real person, so it stays off until it can be done responsibly.',
    from: 'No input in this run',
  },
  {
    code: 'X',
    name: 'Adjacency',
    weight: '8%',
    live: false,
    what:
      'Prior experience adjacent to running a small publishing business – sales, marketing, small-business ownership. Needs a professional-history source.',
    from: 'No input in this run',
  },
];

export default async function Method() {
  await recordHit('method', { path: '/slt/wrtt/method' });
  return (
    <>
      <Link href="/slt/wrtt" className="wrtt-back">
        ← Markets
      </Link>

      <h1 style={{ marginTop: 12 }}>Method</h1>
      <p className="lede">
        What this index is, where the data comes from, how a score is built, and what it misses.
      </p>

      <h2>Why this exists</h2>
      <p className="wrtt-prose">
        The publishers who make a local franchise work are almost never the ones who apply. They
        get <strong>spotted</strong> – someone already embedded in the town, already organizing
        things nobody pays them to organize, who gets tapped on the shoulder. Finding them has
        always depended on somebody happening to know somebody.
      </p>
      <p className="wrtt-prose">
        This is an attempt to make that repeatable. It reads the public record of who leads and
        organizes in a given town, ranks it within that town, and shows the evidence behind every
        name so a person can check the work before anyone is ever contacted.
      </p>

      <h2>Where the data comes from</h2>
      <p className="wrtt-prose">
        Federal nonprofit filings, and nothing else. Every US nonprofit files an annual return –
        a <strong>990</strong>, a <strong>990-EZ</strong> if it is small, or a{' '}
        <strong>990-PF</strong> if it is a private or family foundation – and each one names its
        officers, directors and trustees with their titles, hours per week and pay, signed under
        penalty of perjury. No inference, no scraping of anyone&apos;s personal life.{' '}
        <strong>Every claim on a card links back to the filing it came from.</strong>
      </p>
      <p className="wrtt-prose">
        Below all of those sits the <strong>990-N</strong>, the electronic postcard an
        organization files when it takes in $50,000 a year or less. That is where PTOs, booster
        clubs, small youth leagues and neighbourhood associations live, and they were missing here
        not because they were hard to parse but because the form the parser reads is not the form
        they file. The postcard is thin – one principal officer, no roster, no revenue figure, and
        the IRS publishes only each organization&apos;s most recent one rather than a history – so
        it contributes a name and a year and little else. It is still a name from a population
        that had none.
      </p>
      <p className="wrtt-prose wrtt-prose-dim">
        That is the whole source list: four federal forms. Every scored claim – every role,
        every organization, every date – comes from one of them. Contact details are the one
        thing that does not, and they are kept apart from the scoring for exactly that reason;
        there is a section on them below.
      </p>

      <h2>How a score is built</h2>
      <p className="wrtt-prose">
        Six inputs, below. Three of them have data in this run. Each person&apos;s raw values are
        ranked <em>against everyone else in the same market</em> – a town of twelve thousand
        households and one of sixty thousand produce very different absolute numbers, and the
        question is always local. A 90 means near the top of this town, not of the country.
      </p>
      <p className="wrtt-prose wrtt-prose-dim">
        Weights are an expert prior, not a fitted model, and are versioned on every run so a
        supervised model can replace them later without losing history. Two modifiers apply
        throughout: organization size counts on a log scale so one very large filer cannot
        dominate, and activity fades on a three-year half-life so an old board seat weighs less
        than a current one. The dollar figure beside a role on a sheet is that organization&apos;s
        annual revenue, which is what &ldquo;size&rdquo; means here – it is never a person&apos;s pay.
      </p>

      <div className="wrtt-inputs">
        {INPUTS.map((i) => (
          <div key={i.code} className={`wrtt-input${i.live ? '' : ' is-off'}`}>
            <div className="wrtt-input-head">
              <span className="wrtt-input-code">{i.code}</span>
              <span className="wrtt-input-name">{i.name}</span>
              <span className="wrtt-input-weight">{i.weight}</span>
            </div>
            <p className="wrtt-input-what">{i.what}</p>
            <p className="wrtt-input-from">{i.from}</p>
          </div>
        ))}
      </div>

      <p className="wrtt-prose" style={{ marginTop: 22 }}>
        The three struck-through inputs have no data in this run. Their weight is removed from the
        denominator rather than counted as zero, so a score near 100 means{' '}
        <strong>top of what could actually be measured here</strong>, not a perfect candidate.
      </p>

      <h2>Three things it deliberately discounts</h2>
      <p className="wrtt-prose">
        <strong>Getting paid for it.</strong> The premise is people who organize things nobody
        pays them to organize, and Form 990 reports what each role paid – a volunteer director
        reads $0. Without that, a chief financial officer outranks a PTO vice-president, which
        inverts the whole thesis. The discount runs at two levels. Each paid role counts at a
        fraction of an unpaid one. And a person whose filings report substantial compensation{' '}
        <em>anywhere</em> – the threshold is $50,000 – has their whole score halved, because a
        hospital executive with one volunteer board seat is still a hospital executive, not
        someone whose unpaid organizing is their life in the town. Those rows carry a small{' '}
        <strong>salaried</strong> marker so a low-looking score explains itself. A filing that
        omitted the field is treated as unknown rather than as free labour.
      </p>
      <p className="wrtt-prose">
        <strong>Three seats at the same institution.</strong> Organizations that share a phone
        number or a near-identical name are grouped into one family, because Catholic Charities,
        Catholic Charities Foundation and Catholic Neighborhood Outreach are one crowd rather
        than three. Breadth counts a family once however many of its boards someone sits on, and
        the second and later seats inside it count at a fraction.
      </p>
      <p className="wrtt-prose">
        <strong>The establishment circuit.</strong> A seat on the college board, the economic
        development corporation, the hospital board or the chamber of commerce is an honour, and
        it goes to people who are senior somewhere the filing cannot see – which is close to the
        opposite of someone whose unpaid organizing is their life in the town. The first version
        of this index could not tell a university from a PTO or a chamber from a Rotary club, and
        ranked a college trustee with two business-promotion seats above a booster-club
        president. Those organizations now sit in their own categories at a fraction of the
        weight; <em>breadth</em> counts only grassroots worlds, so three establishment seats no
        longer read as range; and a person with two or more such seats has the whole score
        discounted and carries an <strong>establishment</strong> marker so the card explains
        itself. One seat alone does not flag – plenty of genuine organizers sit on one
        institutional board.
      </p>

      <h2>Whether they live there</h2>
      <p className="wrtt-prose">
        A filing gives the <em>organization&apos;s</em> address, never the person&apos;s, so
        everyone here is placed in a market by where the organization they serve is registered.
        For a booster club or a PTO that is the same thing. It is not the same thing for an
        organization whose reach exceeds the town: a charity headquartered in one suburb may draw
        its board from four states, and a director three hundred miles away would land in that
        suburb&apos;s list looking exactly like a neighbour. We found one doing precisely that.
      </p>
      <p className="wrtt-prose">
        So organizations whose names or scale place them beyond the town are marked{' '}
        <strong>regional</strong>, and a person whose ties are <em>all</em> regional carries a{' '}
        <strong>check residence</strong> marker. One genuinely local seat clears it. This changes
        no score – home addresses are deliberately not collected, so residence cannot be
        confirmed from the record, and discounting someone on an unverifiable guess would be
        worse than saying plainly that it is unverified. The research worksheet carries the same
        flag and a column to record the answer.
      </p>

      <h2>Your verdict is the training data</h2>
      <p className="wrtt-prose">
        Every card carries five buttons: confirm, not the audience, already known, wrong
        person, do not contact. They are the confirm step, and they are the only thing that
        turns this from an expert guess into a model. Each verdict is recorded with a note and
        who gave it; a card that is ruled out steps back on the sheet rather than vanishing,
        because the next reviewer needs to see what was decided. Verdicts do not move a score
        yet – today the weights are hand-set – but every &ldquo;not the audience&rdquo; on a
        card is a labelled example of the thing the weights got wrong, and the establishment
        discount above is exactly what that kind of feedback looks like once it has been acted
        on. Two of the five are worth telling apart: <em>not the audience</em> is the right
        person and the wrong profile, a scoring lesson; <em>wrong person</em> is the filings
        belonging to somebody else with this name, an identity lesson.
      </p>

      <h2>Confidence is not the score</h2>
      <p className="wrtt-prose">
        The number beside each score says how much evidence sits behind it: how many affiliations,
        how many separate organizational families, how many independent sources, and how sure we
        are the records refer to one person rather than two people with the same name. A strong score built
        on a single filing is a lead worth checking, not a fact. Low confidence usually means one
        source and needs more before anyone reaches out.
      </p>

      <h2>What it misses</h2>
      <div className="wrtt-note">
        It finds people who appear on <strong>formal, published rosters</strong>. It will find the
        board chair. It will miss the woman who runs the neighborhood through a group chat with no
        board and nothing filed. Reckon on roughly two thirds of the people who would actually
        qualify. The other third only comes from publishers naming them, which is why the
        confirm-and-add step is part of the system rather than a nicety.
      </div>
      <p className="wrtt-prose" style={{ marginTop: 18 }}>
        <strong>And breadth is thinner than it looks.</strong> The large majority of people in a
        market appear on exactly one organization, so for most of them that input is close to a
        yes-or-no, and the few with two or three stand well clear of the rest. That is a property
        of the source rather than of the town. Adding the 990-N helped, because it reaches the
        small organizations where a lot of the second and third seats actually are – but a
        postcard names one officer and stops, so the rest of that board is still invisible. Read a
        high breadth score as genuinely unusual and a low one as mostly uninformative.
      </p>

      <h2>How you reach someone</h2>
      <p className="wrtt-prose">
        Through the organization they lead. A Form 990 names officers with their titles and hours
        per week and carries <strong>no personal address, phone or email</strong> – that is not a
        gap to work around, it is why this data can be published at all. Sampling 400 filings: the
        organization&apos;s phone is on every one, about half list a usable website, and three
        contained any email address at all, each belonging to the accounting firm that prepared
        the return.
      </p>
      <p className="wrtt-prose">
        So each card shows the organization&apos;s own published phone and site, which is also the
        channel a stranger is supposed to use. A 990-N carries neither, so roles sourced from a
        postcard show the name and the year and no way in – those are leads to research, not
        leads to call.
      </p>
      <p className="wrtt-prose">
        <strong>Where a personal email, phone or profile is held, it was added separately and
        it says so.</strong> None of it comes from a filing. Each detail records where it came
        from and when, whether a person confirmed it belongs to this individual rather than to
        someone with the same name, and whether the individual has asked not to be contacted –
        and that last flag outlives every later update. Numbers are withheld until they have
        been checked against the Do Not Call registry. Nothing appended is treated as evidence:
        it never touches a score, because how reachable someone is says nothing about whether
        they lead.
      </p>
      <p className="wrtt-prose wrtt-prose-dim">
        The matching problem is worth naming. The index knows a name and a town, so common names
        are genuinely ambiguous and a confident-looking match can be the wrong person. That is
        why an unverified detail is marked as such, and why the recommended path is still a
        person checking before anyone is contacted.
      </p>

      <h2>What it is not</h2>
      <p className="wrtt-prose">
        Not a personality assessment, not a prediction about anyone&apos;s character, and not a
        hiring or credit decision. It widens the field of view and shows its work. A human still
        confirms, and any approach should come from someone who knows them.
      </p>
    </>
  );
}
