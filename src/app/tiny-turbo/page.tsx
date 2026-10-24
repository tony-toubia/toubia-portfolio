import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tiny Turbo Club — Little wheels. Big brainpower. | Tony Toubia',
  description: 'An ad-free toy racing game for tablets and phones, with friendly power-ups, grade-based math and spelling, and a growing little garage.',
};

export default function TinyTurboPage() {
  return (
    <main className="fixed inset-0 h-[100dvh] overflow-hidden bg-[#c7e1f5]">
      <iframe src="/tiny-turbo/index.html" className="absolute inset-0 h-full w-full border-0" title="Tiny Turbo Club racing game" allow="autoplay; fullscreen" />
    </main>
  );
}
