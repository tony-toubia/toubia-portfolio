'use client';

import { useWindowManager } from '../WindowManager';
import AuraWindow from './AuraWindow';
import DuetWindow from './DuetWindow';
import AMZToolsWindow from './AMZToolsWindow';
import PrimalHuntWindow from './PrimalHuntWindow';
import StudForgeWindow from './StudForgeWindow';
import HoleHaulWindow from './HoleHaulWindow';

interface Project {
  id: string;
  name: string;
  icon: React.ReactNode;
  windowContent: React.ReactNode;
  windowSize: { width: number; height: number };
}

const projects: Project[] = [
  {
    id: 'aura',
    name: 'Aura Platform',
    icon: (
      <img src="/images/aura-logo.png" alt="Aura" className="w-10 h-10 object-contain" />
    ),
    windowContent: <AuraWindow />,
    windowSize: { width: 600, height: 520 },
  },
  {
    id: 'amz-tools',
    name: 'AMZ Tools',
    icon: (
      <svg viewBox="0 0 48 48" className="w-10 h-10">
        <rect x="4" y="4" width="40" height="40" rx="4" fill="#FFB81C" />
        <path d="M12 28c8 4 16 4 24 0" stroke="#232F3E" strokeWidth="3" fill="none" />
        <path d="M34 28l2 4-4-2" fill="#232F3E" />
        <rect x="16" y="14" width="16" height="12" rx="2" fill="#232F3E" />
      </svg>
    ),
    windowContent: <AMZToolsWindow />,
    windowSize: { width: 600, height: 520 },
  },
  {
    id: 'duet',
    name: 'Duet',
    icon: (
      <img src="/images/duet-logo.png" alt="Duet" className="w-10 h-10 object-contain" />
    ),
    windowContent: <DuetWindow />,
    windowSize: { width: 600, height: 520 },
  },
  {
    id: 'primal-hunt',
    name: 'Primal Hunt',
    icon: (
      <svg viewBox="0 0 48 48" className="w-10 h-10">
        <rect x="4" y="4" width="40" height="40" rx="4" fill="#1a1a2e" />
        <circle cx="24" cy="20" r="10" fill="#4a0" opacity="0.6" />
        <text x="24" y="24" textAnchor="middle" fontSize="14">🎯</text>
        <text x="16" y="40" fontSize="10">👹</text>
        <text x="28" y="40" fontSize="10">🏃</text>
      </svg>
    ),
    windowContent: <PrimalHuntWindow />,
    windowSize: { width: 800, height: 600 },
  },
  {
    id: 'studforge',
    name: 'StudForge',
    icon: (
      <svg viewBox="0 0 48 48" className="w-10 h-10">
        <rect x="4" y="4" width="40" height="40" rx="6" fill="#C91A09" />
        <circle cx="16" cy="16" r="5" fill="#E62310" stroke="#FFF" strokeWidth="1" />
        <circle cx="32" cy="16" r="5" fill="#E62310" stroke="#FFF" strokeWidth="1" />
        <circle cx="16" cy="32" r="5" fill="#E62310" stroke="#FFF" strokeWidth="1" />
        <circle cx="32" cy="32" r="5" fill="#E62310" stroke="#FFF" strokeWidth="1" />
      </svg>
    ),
    windowContent: <StudForgeWindow />,
    windowSize: { width: 880, height: 640 },
  },
  {
    id: 'hole-haul',
    name: 'Hole Haul',
    icon: (
      <svg viewBox="0 0 48 48" className="w-10 h-10">
        <rect x="4" y="4" width="40" height="40" rx="8" fill="#7CC957" />
        <ellipse cx="24" cy="28" rx="15" ry="9" fill="#1B1530" />
        <circle cx="17" cy="15" r="4" fill="#FF5C8A" />
        <rect x="26" y="10" width="8" height="8" rx="1.5" fill="#FFCF33" />
        <circle cx="30" cy="26" r="3" fill="#6FD3FF" />
      </svg>
    ),
    windowContent: <HoleHaulWindow />,
    windowSize: { width: 420, height: 720 },
  },
];

export default function ProjectsWindow() {
  const { openWindow, windows } = useWindowManager();

  const handleDoubleClick = (project: Project) => {
    const offsetIndex = windows.filter(w => w.isOpen).length;
    const availableWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const availableHeight = typeof window !== 'undefined' ? window.innerHeight - 36 : 700;
    const isMobile = availableWidth < 768;

    const windowSize = isMobile
      ? { width: Math.min(availableWidth - 20, 350), height: Math.min(availableHeight - 60, 400) }
      : project.windowSize;

    let centerX = Math.max(10, (availableWidth - windowSize.width) / 2);
    let centerY = Math.max(10, (availableHeight - windowSize.height) / 2);
    const stackOffset = isMobile ? offsetIndex * 15 : offsetIndex * 30;
    centerX = Math.max(10, Math.min(centerX + stackOffset, availableWidth - windowSize.width - 10));
    centerY = Math.max(10, Math.min(centerY + stackOffset, availableHeight - windowSize.height - 10));

    openWindow({
      id: project.id,
      title: project.name,
      isMinimized: false,
      // The games and StudForge need the whole screen on a phone.
      isMaximized: isMobile && ['studforge', 'primal-hunt'].includes(project.id),
      position: { x: centerX, y: centerY },
      size: windowSize,
      content: project.windowContent,
      icon: project.icon,
    });
  };

  return (
    <div className="h-full flex flex-col bg-[var(--window-bg)]">
      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 flex flex-wrap gap-6 content-start">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex flex-col items-center gap-1 w-24 cursor-pointer group p-1 rounded hover:bg-[var(--selection-bg)] hover:bg-opacity-20 transition-colors"
              onClick={(e) => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  // Don't let the click bubble to the folder window, which would
                  // re-focus it on top of the window we just opened.
                  e.stopPropagation();
                  handleDoubleClick(project);
                }
              }}
              onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(project); }}
            >
              <div className="p-1">
                {project.icon}
              </div>
              <span className="text-xs text-center text-[var(--window-text)] group-hover:text-[var(--selection-bg)] break-words w-full font-medium">
                {project.name}
              </span>
              {project.id === 'studforge' && (
                <a
                  href="/studforge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] text-yellow-400 hover:underline mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  /studforge ↗
                </a>
              )}
              {project.id === 'hole-haul' && (
                <a
                  href="/hole-haul"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] text-green-500 hover:underline mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  /hole-haul ↗
                </a>
              )}
              {project.id === 'primal-hunt' && (
                <a
                  href="/map-mobile-game/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] text-green-400 hover:underline mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  /map-mobile-game ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center px-2 py-1 border-t border-[var(--button-shadow)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">{projects.length} items</span>
      </div>
    </div>
  );
}
