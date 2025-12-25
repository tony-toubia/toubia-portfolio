'use client';

import { useRef, useEffect, useState, ReactNode } from 'react';
import { useWindowManager } from './WindowManager';

interface WindowProps {
  id: string;
  title: string;
  children: ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  icon?: ReactNode;
}

export default function Window({
  id,
  title,
  children,
  initialPosition = { x: 100, y: 50 },
  initialSize = { width: 500, height: 400 },
  minWidth = 300,
  minHeight = 200,
  icon,
}: WindowProps) {
  const {
    windows,
    activeWindowId,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    focusWindow,
    updateWindowPosition,
  } = useWindowManager();

  const windowRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const windowState = windows.find(w => w.id === id);
  const isActive = activeWindowId === id;

  const position = windowState?.position || initialPosition;
  const size = windowState?.size || initialSize;
  const isMaximized = windowState?.isMaximized || false;
  const isMinimized = windowState?.isMinimized || false;
  const zIndex = windowState?.zIndex || 100;

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, e.clientX - dragOffset.x);
      const newY = Math.max(0, e.clientY - dragOffset.y);
      updateWindowPosition(id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, id, updateWindowPosition]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-button')) return;

    focusWindow(id);
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  if (!windowState?.isOpen || isMinimized) return null;

  return (
    <div
      ref={windowRef}
      className="window window-animate fixed"
      style={{
        left: isMaximized ? 0 : position.x,
        top: isMaximized ? 0 : position.y,
        width: isMaximized ? '100%' : size.width,
        height: isMaximized ? 'calc(100% - 36px)' : size.height,
        minWidth,
        minHeight,
        zIndex,
      }}
      onClick={() => focusWindow(id)}
    >
      {/* Title Bar */}
      <div
        className={`window-header ${isActive ? '' : 'inactive'}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => isMaximized ? restoreWindow(id) : maximizeWindow(id)}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="w-4 h-4">{icon}</span>}
          <span>{title}</span>
        </div>
        <div className="flex gap-1">
          <button
            className="window-button"
            onClick={(e) => { e.stopPropagation(); minimizeWindow(id); }}
            aria-label="Minimize"
          >
            _
          </button>
          <button
            className="window-button"
            onClick={(e) => { e.stopPropagation(); isMaximized ? restoreWindow(id) : maximizeWindow(id); }}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? '❐' : '□'}
          </button>
          <button
            className="window-button"
            onClick={(e) => { e.stopPropagation(); closeWindow(id); }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-[2px]">
        <div className="inset overflow-auto" style={{ height: isMaximized ? 'calc(100vh - 80px)' : size.height - 30 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
