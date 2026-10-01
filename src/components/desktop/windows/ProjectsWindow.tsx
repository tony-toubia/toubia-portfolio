'use client';

import { useWindowManager } from '../WindowManager';
import AuraWindow from './AuraWindow';
import DuetWindow from './DuetWindow';
import AMZToolsWindow from './AMZToolsWindow';
import PrimalHuntWindow from './PrimalHuntWindow';

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
      isMaximized: false,
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
              className="flex flex-col items-center gap-1 w-20 cursor-pointer group"
              onDoubleClick={() => handleDoubleClick(project)}
            >
              <div className="p-1 group-hover:bg-[var(--selection-bg)] group-hover:bg-opacity-30">
                {project.icon}
              </div>
              <span className="text-xs text-center text-[var(--window-text)] group-hover:text-[var(--selection-bg)] break-words w-full">
                {project.name}
              </span>
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
