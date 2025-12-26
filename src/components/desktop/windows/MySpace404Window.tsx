'use client';

import { useState, useEffect } from 'react';

export default function MySpace404Window() {
  const [visitorCount, setVisitorCount] = useState(0);
  const [showBlink, setShowBlink] = useState(true);

  useEffect(() => {
    // Fake visitor counter
    setVisitorCount(Math.floor(Math.random() * 9000000) + 1000000);

    // Blink effect for text
    const interval = setInterval(() => {
      setShowBlink(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Fake IE Browser Chrome */}
      <div className="bg-[#ECE9D8] border-b border-[#ACA899]">
        {/* Address Bar */}
        <div className="flex items-center gap-1 px-1 py-1">
          <span className="text-[10px] text-gray-600">Address</span>
          <div className="flex-1 flex items-center bg-white border border-[#7F9DB9] px-1">
            <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect fill='%23fff' width='16' height='16'/%3E%3Ctext x='2' y='12' font-size='10'%3E📄%3C/text%3E%3C/svg%3E" alt="" className="w-4 h-4" />
            <span className="text-[11px] text-gray-700 ml-1">http://www.myspace.com/tom</span>
          </div>
          <button className="text-[10px] px-2 py-0.5 bg-[#ECE9D8] border border-[#ACA899]">Go</button>
        </div>
      </div>

      {/* Page Content - The Fun 404 */}
      <div
        className="flex-1 overflow-auto p-4"
        style={{
          background: 'linear-gradient(180deg, #000066 0%, #000033 100%)',
          fontFamily: 'Comic Sans MS, cursive, sans-serif',
        }}
      >
        {/* Starfield background effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `twinkle ${1 + Math.random() * 2}s infinite`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 text-center">
          {/* Animated GIF placeholder - construction sign */}
          <div className="mb-4 flex justify-center gap-2">
            <span className="text-4xl">🚧</span>
            <span className="text-4xl animate-bounce">👷</span>
            <span className="text-4xl">🚧</span>
          </div>

          {/* Main Error */}
          <h1
            className="text-4xl font-bold mb-2"
            style={{
              color: '#FF00FF',
              textShadow: '2px 2px #00FFFF, -2px -2px #FFFF00',
            }}
          >
            OMG! 404 ERROR!!!
          </h1>

          <div
            className="text-xl mb-4"
            style={{ color: '#00FF00' }}
          >
            ~*~*~* Page Not Found *~*~*~
          </div>

          {/* Marquee effect */}
          <div className="overflow-hidden mb-4">
            <div
              className="whitespace-nowrap animate-marquee text-yellow-300 text-sm"
              style={{ animation: 'marquee 10s linear infinite' }}
            >
              ★·.·´¯`·.·★ tHiS pAgE hAs MoVeD oR nEvEr ExIsTeD ★·.·´¯`·.·★ Tom has left the building ★·.·´¯`·.·★ Thanks for the memories ★·.·´¯`·.·★
            </div>
          </div>

          {/* Error Message Box */}
          <div
            className="mx-auto max-w-md p-4 mb-4 border-4"
            style={{
              borderColor: '#FF00FF',
              background: 'rgba(0,0,0,0.7)',
            }}
          >
            <p className="text-white text-sm mb-2">
              <span className={showBlink ? 'text-red-500' : 'text-transparent'}>⚠️</span>
              {' '}The profile you&apos;re looking for has gone the way of dial-up internet, AIM away messages, and your dignity at that 2007 emo phase.
            </p>
            <p className="text-cyan-300 text-xs">
              Error Code: TOP_8_NOT_FOUND
            </p>
            <p className="text-pink-300 text-xs mt-1">
              Last seen: Somewhere between Limewire downloads and updating their &quot;About Me&quot; with song lyrics
            </p>
          </div>

          {/* Fake MySpace elements */}
          <div className="text-left mx-auto max-w-md bg-black/50 p-3 rounded mb-4">
            <div className="text-pink-400 text-xs mb-2 font-bold">Tom&apos;s Last Status Update:</div>
            <div className="text-white text-[11px] italic">
              &quot;Hey everyone! Thanks for adding me as your friend. I&apos;ll always be in your Top 8... in your hearts 💔&quot;
            </div>
            <div className="text-gray-400 text-[9px] mt-1">
              Posted: January 14, 2008 at 11:59 PM
            </div>
          </div>

          {/* Current Mood */}
          <div className="text-yellow-300 text-sm mb-4">
            Current Mood: <span className="text-white">404&apos;d 😭</span>
          </div>

          {/* Visitor Counter */}
          <div
            className="inline-block px-4 py-2 mb-4"
            style={{
              background: '#000',
              border: '2px ridge #silver',
            }}
          >
            <div className="text-[10px] text-gray-400">~ Visitors ~</div>
            <div
              className="font-mono text-lg"
              style={{
                color: '#00FF00',
                textShadow: '0 0 5px #00FF00',
              }}
            >
              {visitorCount.toLocaleString()}
            </div>
            <div className="text-[8px] text-gray-500">(and counting... since 2003)</div>
          </div>

          {/* Links */}
          <div className="text-sm space-y-1">
            <div>
              <span className="text-gray-400">&gt;&gt;</span>
              <span className="text-cyan-400 underline cursor-pointer hover:text-cyan-300"> Back to the future (Home)</span>
            </div>
            <div>
              <span className="text-gray-400">&gt;&gt;</span>
              <span className="text-pink-400 underline cursor-pointer hover:text-pink-300"> Find Tom on LinkedIn (lol jk)</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-[9px] text-gray-500">
            <div>Best viewed in Internet Explorer 6.0 at 800x600 resolution</div>
            <div className="mt-1">© 2003-2008 MySpace.com. All Rights Reserved.</div>
            <div className="text-yellow-600 mt-2">
              🎵 Now Playing: &quot;Welcome to the Black Parade&quot; - My Chemical Romance 🎵
            </div>
          </div>

          {/* Cursor trail would go here if we had one */}
          <div className="mt-4 flex justify-center gap-1">
            <span>✨</span>
            <span>💫</span>
            <span>⭐</span>
            <span>💫</span>
            <span>✨</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
