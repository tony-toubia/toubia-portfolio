'use client';

import { useState, useEffect } from 'react';

export default function InfoBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Info Button - positioned in bottom left corner, above taskbar */}
      <button
        onClick={handleToggle}
        className={`
          fixed z-50 flex items-center justify-center
          w-8 h-8 rounded-full
          bg-gradient-to-br from-blue-400 to-blue-600
          border-2 border-white/50
          shadow-lg shadow-blue-500/30
          hover:from-blue-300 hover:to-blue-500
          hover:shadow-blue-400/50 hover:shadow-xl
          transition-all duration-300 ease-out
          group
          ${isMobile ? 'top-3 left-3' : 'bottom-12 left-4'}
        `}
        title="Why this design?"
        aria-label="Learn about this site's design"
      >
        <span className="text-white font-serif text-lg font-bold italic transform group-hover:scale-110 transition-transform">
          i
        </span>
        {/* Pulsing ring effect */}
        <span className="absolute inset-0 rounded-full border-2 border-blue-300 animate-ping opacity-30" />
      </button>

      {/* Overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] transition-opacity duration-300"
          onClick={handleClose}
        />
      )}

      {/* Info Modal */}
      {isOpen && (
        <div
          className={`
            fixed z-[9999]
            bg-gradient-to-br from-slate-800 to-slate-900
            rounded-xl shadow-2xl
            border border-slate-600/50
            transform transition-all duration-300 ease-out
            ${isMobile
              ? 'inset-x-4 top-1/2 -translate-y-1/2 max-h-[70vh]'
              : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-h-[80vh]'
            }
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-600/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                <span className="text-white font-serif text-lg font-bold italic">i</span>
              </div>
              <h2 className="text-white font-semibold text-lg">Why This Design?</h2>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto max-h-[calc(70vh-80px)] md:max-h-[calc(80vh-80px)]">
            <div className="space-y-4 text-slate-200">
              {/* Retro computer icon */}
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <svg viewBox="0 0 80 70" className="w-20 h-20">
                    {/* Monitor */}
                    <rect x="5" y="5" width="70" height="45" rx="3" fill="#3d4f5f" stroke="#1a2633" strokeWidth="2" />
                    <rect x="10" y="10" width="60" height="35" fill="#008080" />
                    {/* Screen content - tiny icons */}
                    <rect x="14" y="14" width="6" height="6" fill="#fff" opacity="0.8" />
                    <rect x="24" y="14" width="6" height="6" fill="#ffb81c" opacity="0.8" />
                    <rect x="34" y="14" width="6" height="6" fill="#00a3ad" opacity="0.8" />
                    {/* Stand */}
                    <rect x="30" y="50" width="20" height="5" fill="#4a5568" />
                    <rect x="25" y="55" width="30" height="8" rx="2" fill="#4a5568" />
                  </svg>
                  {/* Y2K sparkle */}
                  <span className="absolute -top-1 -right-1 text-xl">✨</span>
                </div>
              </div>

              <p className="text-center text-slate-300 text-sm leading-relaxed">
                <span className="text-blue-400 font-medium">Circa 2000</span> — a pivotal era in personal computing.
              </p>

              <p className="leading-relaxed text-[15px]">
                This retro desktop design is a tribute to the era when I first fell in love with technology.
                Growing up in the late 90s and early 2000s, I witnessed the explosion of personal computer use firsthand —
                from the <span className="text-green-400 font-medium">Y2K</span> scare to burning CDs with <span className="text-orange-400 font-medium">Napster</span>, from the distinctive sound of dial-up internet
                to staying up late chatting on <span className="text-yellow-400 font-medium">AOL Instant Messenger</span>.
              </p>

              <p className="leading-relaxed text-[15px]">
                Those formative years sparked my passion for technology and shaped who I am today.
                This site is a nostalgic nod to that transformative time — the era of Windows 98/2000 interfaces,
                chunky CRT monitors, and the genuine excitement of discovering what computers could do.
              </p>

              <div className="mt-5 pt-4 border-t border-slate-600/50">
                <p className="text-sm text-slate-400 text-center italic">
                  Built with modern tech, styled with retro soul. 💾
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
