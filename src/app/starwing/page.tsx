import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Starwing 64 | Tony Toubia',
  description: 'A 3D N64-style rail & all-range space shooter inspired by Star Fox 64: pilot the Arwing through Corneria, Meteo, and Venom on desktop or mobile.',
};

export default function StarwingPage() {
  return (
    <main className="w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#050a16] fixed inset-0">
      <iframe
        src="/starwing/index.html?standalone=1"
        className="w-full h-full border-0 absolute inset-0"
        title="Starwing 64"
        allow="autoplay; fullscreen"
      />
    </main>
  );
}
