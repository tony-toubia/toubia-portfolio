'use client';

import { ReactNode } from 'react';

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
  return (
    <div
      className={`desktop-icon ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="icon-image">{icon}</div>
      <span className="icon-text">{label}</span>
    </div>
  );
}
