import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'StudForge: 3D LEGO® Blueprint & Idea Maker | Tony Toubia',
  description: 'Describe any idea or explore curated models to generate 3D LEGO blueprints with authentic bricks, 360° exploded layer views, and official BrickLink parts lists.',
};

export default function StudForgePage() {
  return (
    <main className="w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0c0f17] flex flex-col fixed inset-0">
      <div className="flex-1 w-full h-full relative overflow-hidden">
        <iframe
          src="/studforge/index.html?standalone=1"
          className="w-full h-full border-0 absolute inset-0"
          title="StudForge 3D LEGO Blueprint Maker"
          allow="accelerometer; gyroscope; clipboard-write"
        />
      </div>
    </main>
  );
}
