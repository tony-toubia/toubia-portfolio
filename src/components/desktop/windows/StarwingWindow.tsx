'use client';

import { useState } from 'react';

export default function StarwingWindow() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="h-full flex flex-col bg-[var(--window-bg)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-[var(--button-shadow)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)] font-bold flex items-center gap-1.5">
          <span>🚀</span> Starwing 64
        </span>
        <button
          onClick={() => window.open('/starwing', '_blank')}
          className="retro-button px-2 py-0.5 text-xs flex items-center gap-1"
          title="Open in new tab"
        >
          <span>↗</span> Pop Out
        </button>
      </div>

      {/* Game */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#050a16] text-white">
            <div className="text-center">
              <div className="text-2xl mb-2">🚀</div>
              <div className="font-bold text-cyan-300">Engaging G-Diffuser system...</div>
            </div>
          </div>
        )}
        <iframe
          src="/starwing/index.html"
          className="w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
          title="Starwing 64"
          allow="autoplay; fullscreen"
        />
      </div>

      {/* Status bar (hidden on phones to give the game the room) */}
      <div className="hidden sm:flex items-center justify-between px-2 py-1 border-t border-[var(--button-highlight)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">Do a Barrel Roll | Lock-on Charge Shots | Defeat Andron</span>
        <span className="text-xs text-[var(--window-text)]">Pop out for full screen</span>
      </div>
    </div>
  );
}
