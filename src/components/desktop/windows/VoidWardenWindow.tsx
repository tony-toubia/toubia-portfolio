'use client';

import { useState } from 'react';

export default function VoidWardenWindow() {
  const [isLoading, setIsLoading] = useState(true);

  const handlePopOut = () => {
    window.open('/void-warden-game', '_blank');
  };

  return (
    <div className="h-full flex flex-col bg-[var(--window-bg)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-[var(--button-shadow)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)] font-bold">Void Warden: Zombie Swarm Defense</span>
        <button
          onClick={handlePopOut}
          className="retro-button px-2 py-0.5 text-xs flex items-center gap-1"
          title="Open in new tab"
        >
          <span>↗</span> Pop Out
        </button>
      </div>

      {/* Game Container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
            <div className="text-center">
              <div className="text-2xl mb-2">🌀</div>
              <div className="font-bold text-cyan-400">Initializing Void Rift...</div>
              <div className="text-xs text-gray-400 mt-1">Readying containment anomaly</div>
            </div>
          </div>
        )}
        <iframe
          src="/void-warden-game/"
          className="w-full h-full border-0"
          onLoad={() => setIsLoading(false)}
          title="Void Warden Game"
          allow="accelerometer; gyroscope; vibration"
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-[var(--button-highlight)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">Mobile touch & drag supported | Pop out for full screen</span>
        <span className="text-xs text-[var(--window-text)]">🌀 🧟 🏃</span>
      </div>
    </div>
  );
}
