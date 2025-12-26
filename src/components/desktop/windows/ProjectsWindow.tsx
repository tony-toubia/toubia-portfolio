'use client';

import { useWindowManager } from '../WindowManager';
import ProjectWindow from './ProjectWindow';
import DuetWindow from './DuetWindow';

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
      <svg viewBox="0 0 48 48" className="w-10 h-10">
        <rect x="4" y="4" width="40" height="40" rx="8" fill="#00A3AD" />
        <circle cx="24" cy="24" r="12" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="24" cy="24" r="6" fill="#fff" />
        <path d="M24 8v4M24 36v4M8 24h4M36 24h4" stroke="#fff" strokeWidth="2" />
      </svg>
    ),
    windowContent: <ProjectWindow projectId="aura" />,
    windowSize: { width: 550, height: 450 },
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
    windowContent: <ProjectWindow projectId="amz-tools" />,
    windowSize: { width: 550, height: 450 },
  },
  {
    id: 'duet',
    name: 'Duet',
    icon: (
      <svg viewBox="0 0 48 48" className="w-10 h-10">
        <rect x="4" y="4" width="40" height="40" rx="8" fill="#E31837" />
        <circle cx="18" cy="24" r="8" fill="#fff" opacity="0.9" />
        <circle cx="30" cy="24" r="8" fill="#fff" opacity="0.9" />
        <path d="M18 20v8M30 20v8" stroke="#E31837" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    windowContent: <DuetWindow />,
    windowSize: { width: 600, height: 520 },
  },
];

export default function ProjectsWindow() {
  const { openWindow, windows } = useWindowManager();

  const handleDoubleClick = (project: Project) => {
    const offsetIndex = windows.filter(w => w.isOpen).length;
    const availableWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const availableHeight = typeof window !== 'undefined' ? window.innerHeight - 36 : 700;

    const centerX = Math.max(20, (availableWidth - project.windowSize.width) / 2);
    const centerY = Math.max(20, (availableHeight - project.windowSize.height) / 2);
    const stackOffset = offsetIndex * 30;

    openWindow({
      id: project.id,
      title: project.name,
      isMinimized: false,
      isMaximized: false,
      position: { x: centerX + stackOffset, y: centerY + stackOffset },
      size: project.windowSize,
      content: project.windowContent,
      icon: project.icon,
    });
  };

  return (
    <div className="h-full flex flex-col bg-[var(--window-bg)]">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--button-shadow)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">Projects</span>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--button-shadow)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">Address:</span>
        <div className="flex-1 inset px-1 py-0.5 text-xs">
          C:\Users\Tony\Projects
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 inset m-2 overflow-auto">
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
      <div className="flex items-center px-2 py-1 border-t border-[var(--button-highlight)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">{projects.length} object(s)</span>
      </div>
    </div>
  );
}
