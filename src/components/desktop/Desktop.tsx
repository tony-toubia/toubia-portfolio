'use client';

import { useState, useEffect, ReactNode, useMemo } from 'react';
import { useWindowManager } from './WindowManager';
import DesktopIcon from './DesktopIcon';
import Window from './Window';
import Taskbar from './Taskbar';
import AboutWindow from './windows/AboutWindow';
import ProjectWindow from './windows/ProjectWindow';
import ProjectsWindow from './windows/ProjectsWindow';
import ContactWindow from './windows/ContactWindow';
import SpeakingWindow from './windows/SpeakingWindow';
import RecycleBinWindow from './windows/RecycleBinWindow';
import ThoughtLeadershipWindow from './windows/ThoughtLeadershipWindow';
import PhotosWindow from './windows/PhotosWindow';
import MinesweeperWindow from './windows/MinesweeperWindow';
import AIMWindow from './windows/AIMWindow';
import ShortcutsWindow from './windows/ShortcutsWindow';
import MySpace404Window from './windows/MySpace404Window';
import DuetWindow from './windows/DuetWindow';

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
  aim: (
    <img src="/images/aim-icon.png" alt="AIM" className="w-12 h-12 object-contain" />
  ),
  shortcuts: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <path d="M8 8h28v4H12v28H8V8z" fill="#FFB81C" />
      <rect x="12" y="12" width="28" height="28" fill="#FFD700" />
      <rect x="16" y="16" width="20" height="20" fill="#FFF8DC" />
      <path d="M20 22h12M20 28h12M20 34h8" stroke="#666" strokeWidth="1.5" />
    </svg>
  ),
  projects: (
    <svg viewBox="0 0 48 48" className="w-12 h-12">
      <path d="M4 12h16l4-6h20v36H4z" fill="#FFB81C" />
      <rect x="4" y="12" width="40" height="30" fill="#FFC844" />
      <rect x="8" y="18" width="10" height="8" rx="1" fill="#00A3AD" opacity="0.8" />
      <rect x="20" y="18" width="10" height="8" rx="1" fill="#E31837" opacity="0.8" />
      <rect x="32" y="18" width="10" height="8" rx="1" fill="#FFB81C" stroke="#232F3E" strokeWidth="1" />
    </svg>
  ),
  linkedin: (
    <img src="/images/linkedin-icon.png" alt="LinkedIn" className="w-12 h-12 object-contain" />
  ),
};

interface DesktopItem {
  id: string;
  label: string;
  icon: ReactNode;
  windowContent?: ReactNode;
  windowSize?: { width: number; height: number };
  externalUrl?: string;
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
    id: 'projects',
    label: 'Projects',
    icon: icons.projects,
    windowContent: <ProjectsWindow />,
    windowSize: { width: 400, height: 300 },
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
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: icons.linkedin,
    externalUrl: 'https://www.linkedin.com/in/tonytoubia',
  },
];

// Top-right positioned items are built in the component to support callbacks

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
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  // Detect mobile view on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-open windows on initial page load
  useEffect(() => {
    if (hasInitialized) return;

    // Wait a brief moment for the component to fully mount
    const timer = setTimeout(() => {
      const availableWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const availableHeight = typeof window !== 'undefined' ? window.innerHeight - 36 : 700;
      const isMobile = availableWidth < 768;

      // Map window IDs to icon keys
      const iconKeyMap: Record<string, keyof typeof icons> = {
        'about': 'about',
        'speaking': 'speaking',
        'thought-leadership': 'thought',
        'projects': 'projects',
        'contact': 'contact',
      };

      // Define windows to open (same for mobile and desktop)
      // Order: Contact opens first (z-index bottom), About Me opens last (z-index top)
      // Projects added between Thought Leadership and Contact
      const windowsToOpen = [
        { id: 'contact', label: 'Contact', content: <ContactWindow />, size: { width: 500, height: 420 } },
        { id: 'projects', label: 'Projects', content: <ProjectsWindow />, size: { width: 400, height: 300 } },
        { id: 'thought-leadership', label: 'Thought Leadership', content: <ThoughtLeadershipWindow />, size: { width: 550, height: 450 } },
        { id: 'speaking', label: 'Speaking', content: <SpeakingWindow />, size: { width: 600, height: 480 } },
        { id: 'about', label: 'About Me', content: <AboutWindow />, size: { width: 600, height: 500 } },
      ];

      if (isMobile) {
        // On mobile, scale windows to fit screen and stack them
        const mobileWindowWidth = Math.min(availableWidth - 20, 350);
        const mobileWindowHeight = Math.min(availableHeight - 60, 400);
        const totalWindows = windowsToOpen.length;

        windowsToOpen.forEach((win, index) => {
          // Reverse index for horizontal positioning (About Me on left, Contact on right)
          const reverseIndex = totalWindows - 1 - index;
          const xPos = 10 + (reverseIndex * 15);
          const yPos = 10 + (index * 20);

          openWindow({
            id: win.id,
            title: win.label,
            isMinimized: false,
            isMaximized: false,
            position: { x: xPos, y: yPos },
            size: { width: mobileWindowWidth, height: mobileWindowHeight },
            content: win.content,
            icon: icons[iconKeyMap[win.id]],
          });
        });
      } else {
        // Desktop: distribute windows across screen
        const maxWindowWidth = Math.max(...windowsToOpen.map(w => w.size.width));
        const maxWindowHeight = Math.max(...windowsToOpen.map(w => w.size.height));

        const leftMargin = 120;
        const rightMargin = maxWindowWidth + 20;
        const usableWidth = availableWidth - leftMargin - rightMargin;

        const topMargin = 55;
        const bottomMargin = maxWindowHeight + 50;
        const usableHeight = availableHeight - topMargin - bottomMargin;

        const totalWindows = windowsToOpen.length;
        const horizontalSpacing = Math.max(0, usableWidth / (totalWindows - 1));
        const baseVerticalSpacing = Math.max(0, usableHeight / (totalWindows - 1));
        const verticalSpacing = baseVerticalSpacing + 10;

        windowsToOpen.forEach((win, index) => {
          const reverseIndex = totalWindows - 1 - index;
          let xPos = leftMargin + (reverseIndex * horizontalSpacing);
          let yPos = topMargin + (index * verticalSpacing);

          xPos = Math.max(10, Math.min(xPos, availableWidth - win.size.width - 10));
          yPos = Math.max(10, Math.min(yPos, availableHeight - win.size.height - 10));

          openWindow({
            id: win.id,
            title: win.label,
            isMinimized: false,
            isMaximized: false,
            position: { x: xPos, y: yPos },
            size: win.size,
            content: win.content,
            icon: icons[iconKeyMap[win.id]],
          });
        });
      }

      setHasInitialized(true);
    }, 100);

    return () => clearTimeout(timer);
  }, [hasInitialized, openWindow]);

  const handleOpenMySpace = () => {
    const offsetIndex = windows.filter(w => w.isOpen).length;
    const availableWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const availableHeight = typeof window !== 'undefined' ? window.innerHeight - 36 : 700;
    const isMobile = availableWidth < 768;

    const windowSize = isMobile
      ? { width: Math.min(availableWidth - 20, 350), height: Math.min(availableHeight - 60, 400) }
      : { width: 550, height: 500 };

    let centerX = Math.max(10, (availableWidth - windowSize.width) / 2);
    let centerY = Math.max(10, (availableHeight - windowSize.height) / 2);
    const stackOffset = isMobile ? offsetIndex * 15 : offsetIndex * 30;
    centerX = Math.max(10, Math.min(centerX + stackOffset, availableWidth - windowSize.width - 10));
    centerY = Math.max(10, Math.min(centerY + stackOffset, availableHeight - windowSize.height - 10));

    openWindow({
      id: 'myspace-404',
      title: 'Internet Explorer - MySpace',
      isMinimized: false,
      isMaximized: false,
      position: { x: centerX, y: centerY },
      size: windowSize,
      content: <MySpace404Window />,
      icon: (
        <svg viewBox="0 0 16 16" className="w-4 h-4">
          <rect x="1" y="1" width="14" height="14" rx="1" fill="#0078D4" />
          <text x="8" y="12" textAnchor="middle" fontSize="10" fill="#fff">e</text>
        </svg>
      ),
    });
  };

  // Build topRightItems with the MySpace callback
  const topRightItems: DesktopItem[] = [
    {
      id: 'aim',
      label: 'AIM',
      icon: icons.aim,
      windowContent: <AIMWindow />,
      windowSize: { width: 450, height: 500 },
    },
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
    {
      id: 'shortcuts',
      label: 'Shortcuts',
      icon: icons.shortcuts,
      windowContent: <ShortcutsWindow onOpenMySpace={handleOpenMySpace} />,
      windowSize: { width: 320, height: 280 },
    },
  ];

  const handleIconClick = (id: string) => {
    setSelectedIcon(id);
  };

  const handleIconDoubleClick = (item: DesktopItem) => {
    // Handle external URLs
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank');
      return;
    }

    if (!item.windowContent) return;

    const offsetIndex = windows.filter(w => w.isOpen).length;
    const availableWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const availableHeight = typeof window !== 'undefined' ? window.innerHeight - 36 : 700;
    const isMobile = availableWidth < 768;

    // On mobile, use scaled window size (not full screen)
    const windowSize = isMobile
      ? { width: Math.min(availableWidth - 20, 350), height: Math.min(availableHeight - 60, 400) }
      : (item.windowSize || { width: 500, height: 400 });

    // Calculate center position, accounting for taskbar (36px) and stacking offset
    let centerX = Math.max(10, (availableWidth - windowSize.width) / 2);
    let centerY = Math.max(10, (availableHeight - windowSize.height) / 2);

    // Stack windows down and to the right (smaller offset on mobile)
    const stackOffset = isMobile ? offsetIndex * 15 : offsetIndex * 30;
    centerX += stackOffset;
    centerY += stackOffset;

    // Clamp to keep window on screen
    centerX = Math.max(10, Math.min(centerX, availableWidth - windowSize.width - 10));
    centerY = Math.max(10, Math.min(centerY, availableHeight - windowSize.height - 10));

    openWindow({
      id: item.id,
      title: item.label,
      isMinimized: false,
      isMaximized: false,
      position: { x: centerX, y: centerY },
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
        backgroundSize: 'var(--desktop-bg-size)',
        backgroundPosition: 'var(--desktop-bg-position)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Desktop Icons - Bottom grid on mobile, top-left on desktop */}
      {isMobileView ? (
        /* Mobile: Icons in grid at bottom half of screen (above taskbar) */
        <div className="absolute bottom-14 left-0 right-0 top-1/2 px-2 flex items-end pb-2">
          <div className="grid grid-cols-4 gap-x-2 gap-y-1 w-full">
            {[...desktopItems, ...topRightItems, recycleBinItem].map((item) => (
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
        </div>
      ) : (
        <>
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
        </>
      )}

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
