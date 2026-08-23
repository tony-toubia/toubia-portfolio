import Link from 'next/link';

/**
 * Two small components, both deliberately short. The long-form explanation
 * lives at /slt/wrtt/method – it is reference material, and putting it above
 * the listings pushed the actual work below the fold on every page load.
 */

/** Markets page: three sentences and a way through to the detail. */
export function Intro() {
  return (
    <div className="wrtt-intro">
      <p>
        The publishers who make a local franchise work are almost never the ones who apply –
        they get <strong>spotted</strong> doing unpaid community organizing. This reads the
        public record of who leads and organizes in a town, ranks it{' '}
        <em>within that town</em>, and shows the evidence behind every name.
      </p>
      <div className="wrtt-intro-links">
        <Link href="/slt/wrtt/method" className="wrtt-intro-link">
          How the score works →
        </Link>
        {/* A plain anchor, not <Link>: the target is a PDF served by a route
            handler, and prefetching a document download helps nobody. */}
        <a href="/slt/wrtt/deck" className="wrtt-intro-link">
          The concepts deck →
        </a>
      </div>
    </div>
  );
}

/** Sheet page: one line, so the listings start immediately. */
export function SheetNote() {
  return (
    <p className="wrtt-sheetnote">
      Ranked within this market, never nationally. Every score carries its confidence, and every
      claim its source.{' '}
      <Link href="/slt/wrtt/method">What the M/B/T/R/A/X chips mean →</Link>
    </p>
  );
}
