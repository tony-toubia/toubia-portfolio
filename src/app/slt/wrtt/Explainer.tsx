/**
 * Orientation panel for someone opening the console cold. Deliberately
 * non-technical: why the thing exists at all, where the data came from,
 * what each input to the score is, and – the part most tools leave out –
 * what it misses.
 *
 * The component legend does double duty: the M/B/T/R/A/X chips on every
 * candidate row are meaningless without it, so both variants carry it.
 */

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

function InputTable({ dense = false }: { dense?: boolean }) {
  return (
    <div className={`wrtt-inputs${dense ? ' is-dense' : ''}`}>
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
  );
}

export function Explainer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <details className="wrtt-explain wrtt-explain-compact">
        <summary>How to read this sheet</summary>
        <div className="wrtt-explain-body">
          <p>
            Everyone here was found in public records showing they{' '}
            <strong>lead or organize something locally</strong> – a board seat, an officer role,
            a committee chair. The score ranks how much of that activity a person shows relative
            to others <em>in this same market</em>, never nationally. It is a shortlist to start
            from, never a decision.
          </p>
          <p>
            <strong>Confidence sits beside every score for a reason.</strong> A high score on
            thin evidence is the one failure mode that matters – it puts a publisher in front of
            the wrong person. Read them together: a strong score backed by a single filing is a
            lead worth checking, not a fact.
          </p>
          <p className="wrtt-explain-sub">The six chips on each row</p>
          <InputTable dense />
          <p>
            The three struck-through inputs have no data in this run. Their weight is removed
            from the denominator rather than counted as zero, so a score near 100 means{' '}
            <strong>top of what could actually be measured here</strong>, not a perfect
            candidate.
          </p>
        </div>
      </details>
    );
  }

  return (
    <div className="wrtt-explain wrtt-explain-open">
      <h2 className="wrtt-explain-title">Why this exists</h2>

      <p className="wrtt-explain-lead">
        The publishers who make a local franchise work are almost never the ones who apply. They
        get <strong>spotted</strong> – someone already embedded in the town, already organizing
        things nobody pays them to organize, who gets tapped on the shoulder. Finding them has
        always depended on somebody happening to know somebody.
      </p>
      <p className="wrtt-explain-lead">
        This is an attempt to make that repeatable. It reads the public record of who leads and
        organizes in a given town, ranks it within that town, and shows the evidence behind
        every name so a person can check the work before anyone is ever contacted.
      </p>

      <div className="wrtt-explain-grid">
        <section>
          <h3>Where the data comes from</h3>
          <p>
            Every US nonprofit files a Form 990, and Part VII of it names officers, directors and
            trustees with their titles and hours per week, signed under penalty of perjury. That
            is the backbone – no inference, no scraping of anyone&apos;s personal life. Municipal
            boards, chamber directories, sports leagues and race organizers fill in around it.{' '}
            <strong>Every claim on a card links back to the document it came from.</strong>
          </p>
        </section>

        <section>
          <h3>How a score is built</h3>
          <p>
            Six inputs, listed below. Three of them have data in this run. Each person&apos;s raw
            values are then ranked <em>against everyone else in the same market</em> – a town of
            twelve thousand households and one of sixty thousand produce very different absolute
            numbers, and the question is always local. A 90 means near the top of this town, not
            of the country.
          </p>
        </section>

        <section>
          <h3>Confidence is not the score</h3>
          <p>
            The number beside each score says how much evidence sits behind it: how many
            affiliations, how many distinct organizations, how many independent sources, and how
            sure we are the records refer to one person rather than two people with the same
            name. Low confidence usually means one source and needs more before anyone reaches
            out.
          </p>
        </section>
      </div>

      <h2 className="wrtt-explain-title wrtt-explain-title-2">The six inputs</h2>
      <p className="wrtt-explain-note">
        Weights are an expert prior, not a fitted model, and are versioned on every run so a
        supervised model can replace them later without losing history. Two modifiers apply
        throughout: organization size counts on a log scale so one very large filer cannot
        dominate, and activity fades on a three-year half-life so an old board seat weighs less
        than a current one.
      </p>
      <InputTable />

      <div className="wrtt-explain-grid wrtt-explain-grid-2">
        <section className="wrtt-explain-warn">
          <h3>What it misses</h3>
          <p>
            It finds people who appear on <strong>formal, published rosters</strong>. It will
            find the board chair. It will miss the woman who runs the neighborhood through a
            group chat with no board and nothing filed. Reckon on roughly two thirds of the
            people who would actually qualify. The other third only comes from publishers naming
            them, which is why the confirm-and-add step is part of the system rather than a
            nicety.
          </p>
        </section>

        <section>
          <h3>What it is not</h3>
          <p>
            Not a personality assessment, not a prediction about anyone&apos;s character, and not
            a hiring or credit decision. It widens the field of view and shows its work. A human
            still confirms, and any approach should come from someone who knows them.
          </p>
        </section>
      </div>
    </div>
  );
}
