import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SONIC PRISM — Audio-Reactive Shader Visualizer | Tony Toubia',
  description:
    'A modern Windows Media Player & MilkDrop-inspired WebGL audio visualizer with zero-mic desktop/tab digital loopback, local audio file deck, procedural bass synth, and 4 interactive shader worlds.',
};

export default function VisualizerPage() {
  return (
    <main className="fixed inset-0 h-[100dvh] overflow-hidden bg-[#04050c]">
      <iframe
        src="/visualizer/index.html"
        className="absolute inset-0 h-full w-full border-0"
        title="SONIC PRISM Audio Visualizer"
        allow="display-capture; autoplay; fullscreen; microphone"
      />
    </main>
  );
}
