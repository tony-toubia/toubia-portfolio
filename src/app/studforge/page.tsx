import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'StudForge: 3D LEGO® Blueprint & Idea Maker | Tony Toubia',
  description: 'Describe any idea or explore curated models to generate 3D LEGO blueprints with authentic bricks, 360° exploded layer views, and official BrickLink parts lists.',
};

export default function StudForgePage() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-[#0c0f17] flex flex-col">
      <div className="bg-[#090c13] border-b border-white/10 px-3 py-2 flex items-center justify-between z-50 text-xs text-white">
        <Link 
          href="/" 
          className="font-bold text-[#f2cd37] hover:underline flex items-center gap-1.5 transition-colors"
        >
          <span>←</span> Back to Tony Toubia Portfolio
        </Link>
        <span className="font-mono text-gray-400 hidden sm:inline tracking-wider">
          STUDFORGE: 3D LEGO® BLUEPRINT & IDEA MAKER
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[#f2cd37] text-[11px] font-bold bg-[#f2cd37]/10 px-2 py-0.5 rounded border border-[#f2cd37]/30">
            BRICKLINK COMPATIBLE
          </span>
        </div>
      </div>
      <div className="flex-1 w-full h-full relative">
        <iframe
          src="/studforge/index.html"
          className="w-full h-full border-0 absolute inset-0"
          title="StudForge 3D LEGO Blueprint Maker"
          allow="accelerometer; gyroscope; clipboard-write"
        />
      </div>
    </main>
  );
}
