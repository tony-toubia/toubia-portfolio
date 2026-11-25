import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Franklin by Numbers | Tony Toubia',
  description: 'A colour-by-numbers game starring Franklin the dog: pick a picture, pick a colour and tap the matching numbers until he is fully painted.',
};

export default function FranklinPage() {
  return (
    <main className="w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#fbf1df] fixed inset-0">
      <iframe
        src="/franklin/index.html?standalone=1"
        className="w-full h-full border-0 absolute inset-0"
        title="Franklin by Numbers"
        allow="autoplay; vibration"
      />
    </main>
  );
}
