import type { Metadata } from 'next';
import Link from 'next/link';
import './wrtt.css';

/**
 * Link-preview metadata mirrors the SLT Ventures landing page. Only title
 * and description were set here before; openGraph and twitter fell through
 * to the portfolio root layout, so a shared slt.ventures/wrtt link unfurled
 * as the personal site. Scrapers hit the gate and land on /enter, which
 * inherits all of this - so every gated URL previews as SLT Ventures and
 * nothing about the console itself leaks into the preview.
 */
const TITLE = 'SLT Ventures – Relationships, Platforms, Capital';
const DESCRIPTION =
  'SLT Ventures is a Kansas City-based venture group built on three connected engines: a curated referral network, owned operating platforms, and selective strategic investments.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: 'SLT Ventures',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function WrttLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrtt">
      {/* The site root locks body scroll for the desktop UI; this console needs it back. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.add('wrtt-root')`,
        }}
      />
      <div className="wrtt-bar">
        <div className="wrtt-bar-in">
          <Link href="/slt/wrtt" className="wrtt-mark">
            WRTT<span>.Index</span>
          </Link>
          <span className="wrtt-sub">Who Runs This Town – scouting console</span>
          <nav>
            <Link href="/slt/wrtt/method">Method</Link>
            <Link href="/slt/wrtt/profile">Profile</Link>
            <Link href="/slt">SLT Ventures</Link>
          </nav>
        </div>
      </div>
      <div className="wrtt-main">{children}</div>
    </div>
  );
}
