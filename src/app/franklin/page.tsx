import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Franklin by Numbers | Tony Toubia',
  description: 'A colouring game starring Franklin the dog: colour by numbers, paint freely with your own colours and palettes, or race the clock.',
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
