import Link from 'next/link';

/**
 * The long-form explanation, moved off the markets page so the listings are
 * the first thing anyone sees. This is reference material: read once, linked
 * from both the markets index and every scouting sheet.
 */

export const metadata = {
  title: 'Method – WRTT Index',
};

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
      'How much leading someone actually does. Every role they hold is weighted by seniority – founder, president and chair count full, an officer or committee chair somewhat less, a listed member or volunteer counts little – then scaled by how big the organization is and faded by how long ago it was.',
    from: 'Form 990 Part VII officer lists, municipal board rosters',
  },
  {
    code: 'B',
    name: 'Breadth',
    weight: '20%',
    live: true,
    what:
      'How many different worlds they move in. Someone who chairs a school foundation, sits on a chamber board and runs a youth league reaches three separate crowds. Someone with three roles inside one church reaches one. Only leadership-grade roles count here.',
    from: 'Organization type across all of a person’s affiliations',
  },
  {
    code: 'T',
    name: 'Tenure',
    weight: '15%',
    live: true,
    what:
      'How long they have been at it locally, measured from first to most recent appearance and capped at fifteen years. Long tenure is a proxy for the thing that actually matters and cannot be observed directly: that the town trusts them.',
    from: 'Span between earliest and latest filing they appear in',
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

export default function Method() {
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
        Every US nonprofit files a Form 990, and Part VII of it names officers, directors and
        trustees with their titles and hours per week, signed under penalty of perjury. That is
        the backbone – no inference, no scraping of anyone&apos;s personal life. Municipal boards,
        chamber directories, sports leagues and race organizers fill in around it.{' '}
        <strong>Every claim on a card links back to the document it came from.</strong>
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
        than a current one.
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

      <h2>Confidence is not the score</h2>
      <p className="wrtt-prose">
        The number beside each score says how much evidence sits behind it: how many affiliations,
        how many distinct organizations, how many independent sources, and how sure we are the
        records refer to one person rather than two people with the same name. A strong score built
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
        channel a stranger is supposed to use. Personal contact details are not inferred, bought
        from a data broker, or scraped from social profiles. If they are ever needed they come
        from the publisher who already knows the person, at the confirm step.
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
