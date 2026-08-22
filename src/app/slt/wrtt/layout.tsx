import type { Metadata } from 'next';
import Link from 'next/link';
import './wrtt.css';

export const metadata: Metadata = {
  title: 'WRTT Index – SLT Ventures',
  description: 'Scouting console for the Who Runs This Town index.',
  robots: { index: false, follow: false },
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
