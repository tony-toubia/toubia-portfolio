import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Void Warden: Zombie Swarm Defense | Tony Toubia',
  description: 'Mobile-first 3D black hole zombie defense game built with Three.js. Control an expanding void anomaly to consume mutant hordes and protect human survivors.',
};

export default function VoidWardenGamePage() {
  return (
    <main className="w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-black flex flex-col fixed inset-0">
      <div className="bg-[#0e121e] border-b border-[#00f3ff]/30 px-3 py-1.5 flex items-center justify-between z-50 text-xs text-white shrink-0">
        <Link 
          href="/" 
          className="font-bold text-[#00f3ff] hover:underline flex items-center gap-1.5 transition-colors text-[11px] sm:text-xs"
        >
          <span>←</span> Back to Portfolio
        </Link>
        <span className="font-mono text-gray-400 hidden sm:inline text-xs">
          VOID WARDEN: ZOMBIE SWARM DEFENSE
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[#00ff88] text-[10px] sm:text-[11px] font-bold">
            3D WEBGL
          </span>
        </div>
      </div>
      <div className="flex-1 w-full h-full relative overflow-hidden">
        <iframe
          src="/void-warden-game/index.html"
          className="w-full h-full border-0 absolute inset-0"
          title="Void Warden: Zombie Swarm"
          allow="accelerometer; gyroscope; vibration"
        />
      </div>
    </main>
  );
}
