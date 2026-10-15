import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shardfall | Tony Toubia',
  description: 'A low-poly 3D sci-fi real-time strategy game: build a base, harvest shards, train an army and defeat the AI, on desktop or phone.',
};

export default function ShardfallPage() {
  return (
    <main className="w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#070b12] fixed inset-0">
      <iframe
        src="/shardfall/index.html?standalone=1"
        className="w-full h-full border-0 absolute inset-0"
        title="Shardfall"
        allow="autoplay; fullscreen"
      />
    </main>
  );
}
