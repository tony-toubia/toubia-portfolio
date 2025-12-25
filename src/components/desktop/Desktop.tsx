'use client';

import { useState, ReactNode } from 'react';
import { useWindowManager } from './WindowManager';
import DesktopIcon from './DesktopIcon';
import Window from './Window';
import Taskbar from './Taskbar';
import AboutWindow from './windows/AboutWindow';
import ProjectWindow from './windows/ProjectWindow';
import ContactWindow from './windows/ContactWindow';
import SpeakingWindow from './windows/SpeakingWindow';
import RecycleBinWindow from './windows/RecycleBinWindow';
import ThoughtLeadershipWindow from './windows/ThoughtLeadershipWindow';
import PhotosWindow from './windows/PhotosWindow';
import MinesweeperWindow from './windows/MinesweeperWindow';

// Icon SVGs
const icons = {
  about: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#004687" />
      <circle cx="24" cy="18" r="8" fill="#fff" />
      <path d="M12 40c0-8 5-12 12-12s12 4 12 12" fill="#fff" />
    </svg>
  ),
  aura: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="4" width="40" height="40" rx="8" fill="#00A3AD" />
      <circle cx="24" cy="24" r="12" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="24" cy="24" r="6" fill="#fff" />
      <path d="M24 8v4M24 36v4M8 24h4M36 24h4" stroke="#fff" strokeWidth="2" />
    </svg>
  ),
  amzTools: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#FFB81C" />
      <path d="M12 28c8 4 16 4 24 0" stroke="#232F3E" strokeWidth="3" fill="none" />
      <path d="M34 28l2 4-4-2" fill="#232F3E" />
      <rect x="16" y="14" width="16" height="12" rx="2" fill="#232F3E" />
    </svg>
  ),
  duet: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="4" width="40" height="40" rx="8" fill="#E31837" />
      <circle cx="18" cy="24" r="8" fill="#fff" opacity="0.9" />
      <circle cx="30" cy="24" r="8" fill="#fff" opacity="0.9" />
      <path d="M18 20v8M30 20v8" stroke="#E31837" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  speaking: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#004687" />
      <rect x="20" y="12" width="8" height="16" rx="4" fill="#fff" />
      <path d="M16 24c0 6 4 10 8 10s8-4 8-10" stroke="#fff" strokeWidth="2" fill="none" />
      <path d="M24 34v6M18 40h12" stroke="#fff" strokeWidth="2" />
    </svg>
  ),
  contact: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="10" width="40" height="28" rx="2" fill="#00A3AD" />
      <path d="M4 14l20 12 20-12" stroke="#fff" strokeWidth="2" fill="none" />
    </svg>
  ),
  thought: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="8" y="4" width="32" height="40" fill="#fff" />
      <rect x="8" y="4" width="32" height="8" fill="#FFB81C" />
      <path d="M14 18h20M14 26h20M14 34h12" stroke="#333" strokeWidth="2" />
    </svg>
  ),
  recycle: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <path d="M16 16h16l2 24H14l2-24z" fill="#808080" />
      <rect x="12" y="12" width="24" height="4" rx="1" fill="#808080" />
      <path d="M20 8h8v4h-8z" fill="#808080" />
      <path d="M19 22v14M24 22v14M29 22v14" stroke="#606060" strokeWidth="1" />
    </svg>
  ),
  photos: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="8" width="40" height="32" rx="2" fill="#FFB81C" />
      <rect x="8" y="12" width="32" height="24" fill="#87CEEB" />
      <circle cx="16" cy="20" r="4" fill="#FFD700" />
      <path d="M8 36l10-12 8 8 6-6 8 10H8z" fill="#228B22" />
    </svg>
  ),
  minesweeper: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <rect x="4" y="4" width="40" height="40" rx="2" fill="#c0c0c0" />
      <rect x="8" y="8" width="10" height="10" fill="#fff" stroke="#808080" strokeWidth="1" />
      <rect x="19" y="8" width="10" height="10" fill="#fff" stroke="#808080" strokeWidth="1" />
      <rect x="30" y="8" width="10" height="10" fill="#c0c0c0" style={{ boxShadow: 'inset 1px 1px #fff' }} />
      <rect x="8" y="19" width="10" height="10" fill="#c0c0c0" />
      <rect x="19" y="19" width="10" height="10" fill="#fff" stroke="#808080" strokeWidth="1" />
      <rect x="30" y="19" width="10" height="10" fill="#fff" stroke="#808080" strokeWidth="1" />
      <rect x="8" y="30" width="10" height="10" fill="#fff" stroke="#808080" strokeWidth="1" />
      <rect x="19" y="30" width="10" height="10" fill="#c0c0c0" />
      <rect x="30" y="30" width="10" height="10" fill="#fff" stroke="#808080" strokeWidth="1" />
      <circle cx="13" cy="35" r="4" fill="#000" />
      <text x="24" y="17" textAnchor="middle" fontSize="8" fill="#0000ff" fontWeight="bold">1</text>
      <text x="35" y="28" textAnchor="middle" fontSize="8" fill="#008000" fontWeight="bold">2</text>
      <text x="13" cy="24" y="28" textAnchor="middle" fontSize="10" fill="#ff0000">🚩</text>
    </svg>
  ),
};

interface DesktopItem {
  id: string;
  label: string;
  icon: ReactNode;
  windowContent: ReactNode;
  windowSize?: { width: number; height: number };
}

// Main desktop items (top-left grid)
const desktopItems: DesktopItem[] = [
  {
    id: 'about',
    label: 'About Me',
    icon: icons.about,
    windowContent: <AboutWindow />,
    windowSize: { width: 600, height: 500 },
  },
  {
    id: 'aura',
    label: 'Aura Platform',
    icon: icons.aura,
    windowContent: <ProjectWindow projectId="aura" />,
    windowSize: { width: 550, height: 450 },
  },
  {
    id: 'amz-tools',
    label: 'AMZ Tools',
    icon: icons.amzTools,
    windowContent: <ProjectWindow projectId="amz-tools" />,
    windowSize: { width: 550, height: 450 },
  },
  {
    id: 'duet',
    label: 'Duet',
    icon: icons.duet,
    windowContent: <ProjectWindow projectId="duet" />,
    windowSize: { width: 550, height: 450 },
  },
  {
    id: 'speaking',
    label: 'Speaking',
    icon: icons.speaking,
    windowContent: <SpeakingWindow />,
    windowSize: { width: 600, height: 480 },
  },
  {
    id: 'thought-leadership',
    label: 'Thought Leadership',
    icon: icons.thought,
    windowContent: <ThoughtLeadershipWindow />,
    windowSize: { width: 550, height: 450 },
  },
  {
    id: 'contact',
    label: 'Contact',
    icon: icons.contact,
    windowContent: <ContactWindow />,
    windowSize: { width: 500, height: 420 },
  },
];

// Top-right positioned items
const topRightItems: DesktopItem[] = [
  {
    id: 'photos',
    label: 'Photos',
    icon: icons.photos,
    windowContent: <PhotosWindow />,
    windowSize: { width: 500, height: 400 },
  },
  {
    id: 'minesweeper',
    label: 'Minesweeper',
    icon: icons.minesweeper,
    windowContent: <MinesweeperWindow />,
    windowSize: { width: 250, height: 360 },
  },
];

// Bottom-right positioned item
const recycleBinItem: DesktopItem = {
  id: 'recycle-bin',
  label: 'Recycle Bin',
  icon: icons.recycle,
  windowContent: <RecycleBinWindow />,
  windowSize: { width: 500, height: 400 },
};

export default function Desktop() {
  const { openWindow, windows } = useWindowManager();
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);

  const handleIconClick = (id: string) => {
    setSelectedIcon(id);
  };

  const handleIconDoubleClick = (item: DesktopItem) => {
    const offsetIndex = windows.filter(w => w.isOpen).length;
    const windowSize = item.windowSize || { width: 500, height: 400 };

    // Calculate center position, accounting for taskbar (36px) and stacking offset
    const availableWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const availableHeight = typeof window !== 'undefined' ? window.innerHeight - 36 : 700;

    const centerX = Math.max(20, (availableWidth - windowSize.width) / 2);
    const centerY = Math.max(20, (availableHeight - windowSize.height) / 2);

    // Stack windows down and to the right
    const stackOffset = offsetIndex * 30;

    openWindow({
      id: item.id,
      title: item.label,
      isMinimized: false,
      isMaximized: false,
      position: { x: centerX + stackOffset, y: centerY + stackOffset },
      size: windowSize,
      content: item.windowContent,
      icon: item.icon,
    });
  };

  const handleDesktopClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('desktop-area')) {
      setSelectedIcon(null);
    }
  };

  return (
    <div
      className="desktop-area w-full h-full bg-desktop-bg relative overflow-hidden"
      onClick={handleDesktopClick}
      style={{
        backgroundImage: 'var(--desktop-bg-image)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Desktop Icons Grid - Top Left */}
      <div className="absolute top-4 left-4 flex flex-col flex-wrap gap-2 h-[calc(100%-80px)] content-start">
        {desktopItems.map((item) => (
          <DesktopIcon
            key={item.id}
            icon={item.icon}
            label={item.label}
            onClick={() => handleIconClick(item.id)}
            onDoubleClick={() => handleIconDoubleClick(item)}
            isSelected={selectedIcon === item.id}
          />
        ))}
      </div>

      {/* Top Right Icons */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        {topRightItems.map((item) => (
          <DesktopIcon
            key={item.id}
            icon={item.icon}
            label={item.label}
            onClick={() => handleIconClick(item.id)}
            onDoubleClick={() => handleIconDoubleClick(item)}
            isSelected={selectedIcon === item.id}
          />
        ))}
      </div>

      {/* Recycle Bin - Bottom Right */}
      <div className="absolute bottom-14 right-4">
        <DesktopIcon
          icon={recycleBinItem.icon}
          label={recycleBinItem.label}
          onClick={() => handleIconClick(recycleBinItem.id)}
          onDoubleClick={() => handleIconDoubleClick(recycleBinItem)}
          isSelected={selectedIcon === recycleBinItem.id}
        />
      </div>

      {/* Windows */}
      {windows.map((window) => (
        <Window
          key={window.id}
          id={window.id}
          title={window.title}
          initialPosition={window.position}
          initialSize={window.size}
          icon={window.icon}
        >
          {window.content}
        </Window>
      ))}

      {/* Taskbar */}
      <Taskbar />
    </div>
  );
}
