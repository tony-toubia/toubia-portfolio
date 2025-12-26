'use client';

import { useState, useEffect } from 'react';
import { useWindowManager } from './WindowManager';
import { useTheme } from '../ThemeProvider';

export default function Taskbar() {
  const { windows, activeWindowId, restoreWindow, focusWindow, minimizeWindow } = useWindowManager();
  const { theme, toggleTheme } = useTheme();
  const [time, setTime] = useState<string>('');
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const openWindows = windows.filter(w => w.isOpen);

  const handleTaskbarButtonClick = (windowId: string) => {
    const window = windows.find(w => w.id === windowId);
    if (!window) return;

    if (window.isMinimized) {
      restoreWindow(windowId);
    } else if (activeWindowId === windowId) {
      minimizeWindow(windowId);
    } else {
      focusWindow(windowId);
    }
  };

  return (
    <>
      {/* Start Menu */}
      {isStartMenuOpen && (
        <div
          className="menu fixed bottom-[36px] left-0 w-64 z-[9999]"
          style={{ boxShadow: '2px -2px 0 var(--button-dark-shadow)' }}
        >
          {/* Start menu header */}
          <div className="bg-gradient-to-b from-[#000080] to-[#1084d0] p-2 flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-sm flex items-center justify-center">
              <span className="text-2xl">👨‍💼</span>
            </div>
            <span className="text-white font-bold text-sm">Tony Toubia</span>
          </div>

          <div className="py-1">
            <div className="menu-item" onClick={() => { setIsStartMenuOpen(false); }}>
              <span>📁</span> My Projects
            </div>
            <div className="menu-item" onClick={() => { setIsStartMenuOpen(false); }}>
              <span>📄</span> About Me
            </div>
            <div className="menu-item" onClick={() => { setIsStartMenuOpen(false); }}>
              <span>🎤</span> Speaking
            </div>
            <div className="menu-item" onClick={() => { setIsStartMenuOpen(false); }}>
              <span>📧</span> Contact
            </div>
            <div className="menu-separator" />
            <div className="menu-item" onClick={toggleTheme}>
              <span>{theme === 'light' ? '🌙' : '☀️'}</span>
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </div>
            <div className="menu-separator" />
            <div className="menu-item">
              <img src="/images/linkedin-icon.png" alt="" className="w-4 h-4 object-contain" />
              <a href="https://www.linkedin.com/in/tonytoubia" target="_blank" rel="noopener noreferrer" className="text-inherit no-underline">
                LinkedIn
              </a>
            </div>
          </div>
          {/* Vibe coded credit */}
          <div className="px-2 py-1 text-[9px] text-center text-gray-500 border-t border-[var(--button-shadow)]">
            <a
              href="https://claude.ai/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--kc-teal)] transition-colors"
            >
              Proudly vibe coded with Claude Code
            </a>
          </div>
        </div>
      )}

      {/* Taskbar */}
      <div className={`taskbar fixed bottom-0 left-0 right-0 flex items-center px-1 gap-1 z-[9998] ${isMobile ? 'h-12' : ''}`}>
        {/* Start Button */}
        <button
          className={`start-button cursor-pointer ${isStartMenuOpen ? 'active' : ''}`}
          onClick={() => setIsStartMenuOpen(!isStartMenuOpen)}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="9" height="9" fill="#E31837" />
            <rect x="13" y="2" width="9" height="9" fill="#FFB81C" />
            <rect x="2" y="13" width="9" height="9" fill="#004687" />
            <rect x="13" y="13" width="9" height="9" fill="#00A3AD" />
          </svg>
          <span className="hidden sm:inline">Start</span>
        </button>

        {/* Divider */}
        <div className="w-[2px] h-6 bg-[var(--button-shadow)] shadow-[1px_0_0_var(--button-highlight)] mx-1" />

        {/* Open Windows */}
        <div className="flex-1 flex gap-1 overflow-x-auto">
          {[...openWindows].reverse().map(window => (
            <button
              key={window.id}
              className={`retro-button flex items-center gap-1 truncate ${
                isMobile ? 'min-w-[40px] max-w-[40px] justify-center p-1' : 'min-w-[120px] max-w-[200px]'
              } ${
                activeWindowId === window.id && !window.isMinimized ? 'active' : ''
              }`}
              onClick={() => handleTaskbarButtonClick(window.id)}
              style={activeWindowId === window.id && !window.isMinimized ? {
                boxShadow: 'inset 1px 1px 0 var(--button-shadow), inset -1px -1px 0 var(--button-highlight)',
                background: 'repeating-conic-gradient(var(--button-face) 0% 25%, var(--window-bg) 0% 50%) 50% / 2px 2px',
              } : {}}
              title={window.title}
            >
              {window.icon && <span className={`shrink-0 flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4 ${isMobile ? 'w-5 h-5 [&_svg]:w-5 [&_svg]:h-5' : 'w-4 h-4'}`}>{window.icon}</span>}
              {!isMobile && <span className="truncate text-xs">{window.title}</span>}
            </button>
          ))}
        </div>

        {/* System Tray */}
        <div className="system-tray flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="cursor-pointer hover:bg-[var(--selection-bg)] hover:text-white p-1"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <span className="text-[var(--window-text)]">{time}</span>
        </div>
      </div>

      {/* Click outside to close start menu */}
      {isStartMenuOpen && (
        <div
          className="fixed inset-0 z-[9997]"
          onClick={() => setIsStartMenuOpen(false)}
        />
      )}
    </>
  );
}
