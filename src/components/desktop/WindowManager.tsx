'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { trackAxoEvent } from '@/lib/axo-events';

export interface WindowState {
  id: string;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  content: ReactNode;
  icon?: ReactNode;
}

interface WindowManagerContextType {
  windows: WindowState[];
  activeWindowId: string | null;
  /** `auto: true` marks a window the page opened by itself on load. */
  openWindow: (window: Omit<WindowState, 'zIndex' | 'isOpen'>, options?: { auto?: boolean }) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  updateWindowPosition: (id: string, position: { x: number; y: number }) => void;
  updateWindowSize: (id: string, size: { width: number; height: number }) => void;
}

const WindowManagerContext = createContext<WindowManagerContextType | null>(null);

let nextZIndex = 100;
// The window opened most recently, and when. A click that opens a window also
// bubbles to whatever it was clicked in (a folder window), which would focus
// that on top of the new one; focus requests right after an open are ignored.
let lastOpened: { id: string; at: number } | null = null;

// AXO reporting. A window the visitor opens is a `window_open`. The windows
// the desktop opens by itself on load say nothing about interest, so each one
// reports `window_engaged` once, the first time the visitor focuses it (a
// click inside, a drag of its title bar, or picking it from the taskbar).
// Closing or minimizing never focuses a window, so neither counts.
const autoOpened = new Map<string, string>();
const engaged = new Set<string>();

function markEngaged(id: string) {
  const title = autoOpened.get(id);
  if (title === undefined || engaged.has(id)) return;
  engaged.add(id);
  trackAxoEvent('window_engaged', { window: id, title });
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);

  const openWindow = useCallback((window: Omit<WindowState, 'zIndex' | 'isOpen'>, options?: { auto?: boolean }) => {
    if (options?.auto) {
      autoOpened.set(window.id, window.title);
    } else {
      trackAxoEvent('window_open', { window: window.id, title: window.title });
    }
    setWindows(prev => {
      const existing = prev.find(w => w.id === window.id);
      if (existing) {
        // If window exists, just focus it
        return prev.map(w =>
          w.id === window.id
            ? { ...w, isOpen: true, isMinimized: false, zIndex: nextZIndex++ }
            : w
        );
      }
      return [...prev, { ...window, isOpen: true, zIndex: nextZIndex++ }];
    });
    lastOpened = { id: window.id, at: Date.now() };
    setActiveWindowId(window.id);
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, isOpen: false } : w
    ));
    setActiveWindowId(prev => prev === id ? null : prev);
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, isMinimized: true } : w
    ));
    setActiveWindowId(prev => prev === id ? null : prev);
  }, []);

  const maximizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, isMaximized: true } : w
    ));
  }, []);

  const restoreWindow = useCallback((id: string) => {
    markEngaged(id);
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, isMinimized: false, isMaximized: false, zIndex: nextZIndex++ } : w
    ));
    setActiveWindowId(id);
  }, []);

  const focusWindow = useCallback((id: string) => {
    if (lastOpened && lastOpened.id !== id && Date.now() - lastOpened.at < 400) return;
    markEngaged(id);
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, zIndex: nextZIndex++ } : w
    ));
    setActiveWindowId(id);
  }, []);

  const updateWindowPosition = useCallback((id: string, position: { x: number; y: number }) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, position } : w
    ));
  }, []);

  const updateWindowSize = useCallback((id: string, size: { width: number; height: number }) => {
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, size } : w
    ));
  }, []);

  return (
    <WindowManagerContext.Provider
      value={{
        windows,
        activeWindowId,
        openWindow,
        closeWindow,
        minimizeWindow,
        maximizeWindow,
        restoreWindow,
        focusWindow,
        updateWindowPosition,
        updateWindowSize,
      }}
    >
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error('useWindowManager must be used within a WindowManagerProvider');
  }
  return context;
}
