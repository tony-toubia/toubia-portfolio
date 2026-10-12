import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Void Warden: Zombie Swarm Defense | Tony Toubia',
  description: 'Mobile-first 3D black hole zombie defense game built with Three.js. Control an expanding void anomaly to consume mutant hordes and protect human survivors.',
};

export default function VoidWardenPage() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-black flex flex-col">
      <div className="bg-[#0e121e] border-b border-[#00f3ff]/30 px-3 py-2 flex items-center justify-between z-50 text-xs text-white">
        <Link 
          href="/" 
          className="font-bold text-[#00f3ff] hover:underline flex items-center gap-1.5 transition-colors"
        >
          <span>←</span> Back to Tony Toubia Portfolio
        </Link>
        <span className="font-mono text-gray-400 hidden sm:inline">
          VOID WARDEN: ZOMBIE SWARM DEFENSE
        </span>
        <span className="text-[#00ff88] text-[11px] font-bold">
          3D WEBGL ENGINE
        </span>
      </div>
      <div className="flex-1 w-full h-full relative">
        <iframe
          src="/void-warden/index.html"
          className="w-full h-full border-0 absolute inset-0"
          title="Void Warden: Zombie Swarm"
          allow="accelerometer; gyroscope; vibration"
        />
      </div>
    </main>
  );
}
