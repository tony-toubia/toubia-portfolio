import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hole Haul | Tony Toubia',
  description: 'A casual 3D hole puzzle: steer a hole around themed boards, swallow the items each level asks for before the clock runs out, and grow big enough to eat everything.',
};

export default function HoleHaulPage() {
  return (
    <main className="w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#7cc6ff] fixed inset-0">
      <iframe
        src="/hole-haul/index.html?standalone=1"
        className="w-full h-full border-0 absolute inset-0"
        title="Hole Haul"
        allow="accelerometer; gyroscope; vibration; autoplay"
      />
    </main>
  );
}
