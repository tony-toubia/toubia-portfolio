'use client';

export default function TinyTurboWindow() {
  return (
    <div className="flex h-full flex-col bg-[var(--window-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--button-shadow)] bg-[var(--button-face)] px-2 py-1">
        <span className="text-xs font-bold text-[var(--window-text)]">🏎️ Tiny Turbo Club</span>
        <a href="/tiny-turbo" target="_blank" rel="noopener noreferrer" className="retro-button px-2 py-0.5 text-xs">↗ Play full screen</a>
      </div>
      <iframe src="/tiny-turbo/index.html" className="min-h-0 w-full flex-1 border-0" title="Tiny Turbo Club" allow="autoplay; fullscreen" />
    </div>
  );
}
