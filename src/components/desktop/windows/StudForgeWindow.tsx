'use client';

import { useState } from 'react';

export default function StudForgeWindow() {
  const [isLoading, setIsLoading] = useState(true);

  const handlePopOut = () => {
    window.open('/studforge', '_blank');
  };

  return (
    <div className="h-full flex flex-col bg-[var(--window-bg)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-[var(--button-shadow)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)] font-bold flex items-center gap-1.5">
          <span>🧱</span> StudForge: 3D LEGO® Blueprint & Idea Maker
        </span>
        <button
          onClick={handlePopOut}
          className="retro-button px-2 py-0.5 text-xs flex items-center gap-1"
          title="Open in new tab"
        >
          <span>↗</span> Pop Out
        </button>
      </div>

      {/* Game/App Container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0c0f17] text-white">
            <div className="text-center">
              <div className="text-2xl mb-2">🧱</div>
              <div className="font-bold text-[#f2cd37]">Loading StudForge Studio...</div>
              <div className="text-xs text-gray-400 mt-1">Sorting bricks & parts catalog</div>
            </div>
          </div>
        )}
        <iframe
          src="/studforge/index.html"
          className="w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
          title="StudForge 3D LEGO Blueprint Maker"
          allow="accelerometer; gyroscope; clipboard-write"
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-[var(--button-highlight)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">Explore sets | Save build progress | Export parts lists</span>
        <span className="text-xs text-[var(--window-text)]">🧱 🚀 🏰 🏎️</span>
      </div>
    </div>
  );
}
