'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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
  openWindow: (window: Omit<WindowState, 'zIndex' | 'isOpen'>) => void;
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

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);

  const openWindow = useCallback((window: Omit<WindowState, 'zIndex' | 'isOpen'>) => {
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
    setWindows(prev => prev.map(w =>
      w.id === id ? { ...w, isMinimized: false, isMaximized: false, zIndex: nextZIndex++ } : w
    ));
    setActiveWindowId(id);
  }, []);

  const focusWindow = useCallback((id: string) => {
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
