'use client';

import { ReactNode, useRef, useCallback } from 'react';

interface DesktopIconProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  onDoubleClick: () => void;
  isSelected?: boolean;
}

export default function DesktopIcon({
  icon,
  label,
  onClick,
  onDoubleClick,
  isSelected = false,
}: DesktopIconProps) {
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    // Clear any pending single-tap timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
    }

    // Double-tap/click detection (within 300ms)
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      lastTapRef.current = 0;
      onDoubleClick();
    } else {
      lastTapRef.current = now;
      // Delay single click to allow for double-tap detection
      tapTimeoutRef.current = setTimeout(() => {
        onClick();
        tapTimeoutRef.current = null;
      }, 300);
    }
  }, [onClick, onDoubleClick]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent ghost clicks
    handleClick(e);
  }, [handleClick]);

  return (
    <div
      className={`desktop-icon ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      onTouchEnd={handleTouchEnd}
    >
      <div className="icon-image">{icon}</div>
      <span className="icon-text">{label}</span>
    </div>
  );
}
