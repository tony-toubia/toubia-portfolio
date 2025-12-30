'use client';

import { useState } from 'react';

interface Shortcut {
  id: string;
  name: string;
  icon: React.ReactNode;
  url?: string;
  action?: 'myspace';
}

const shortcuts: Shortcut[] = [
  {
    id: 'claude',
    name: 'Claude',
    icon: (
      <img src="/images/claude-ai-icon.png" alt="Claude" className="w-10 h-10 object-contain" />
    ),
    url: 'https://claude.ai',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: (
      <img src="/images/chatgpt-icon.png" alt="ChatGPT" className="w-10 h-10 object-contain" />
    ),
    url: 'https://chat.openai.com',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: (
      <img src="/images/google-gemini-icon.png" alt="Gemini" className="w-10 h-10 object-contain" />
    ),
    url: 'https://gemini.google.com',
  },
  {
    id: 'myspace',
    name: 'MySpace',
    icon: (
      <img src="/images/myspace-icon.png" alt="MySpace" className="w-10 h-10 object-contain" />
    ),
    action: 'myspace',
  },
];

interface ShortcutsWindowProps {
  onOpenMySpace?: () => void;
}

export default function ShortcutsWindow({ onOpenMySpace }: ShortcutsWindowProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleDoubleClick = (shortcut: Shortcut) => {
    if (shortcut.url) {
      window.open(shortcut.url, '_blank');
    } else if (shortcut.action === 'myspace' && onOpenMySpace) {
      onOpenMySpace();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--window-bg)]">
      {/* Shortcuts Grid */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-wrap gap-4 p-4">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className={`flex flex-col items-center gap-1 p-2 cursor-pointer border w-20 ${
              selectedId === shortcut.id
                ? 'bg-[var(--selection-bg)] border-[var(--selection-bg)]'
                : 'border-transparent hover:bg-[var(--button-face)]'
            }`}
            onClick={() => setSelectedId(shortcut.id)}
            onDoubleClick={() => handleDoubleClick(shortcut)}
          >
            <div className="w-12 h-12 flex items-center justify-center">
              {shortcut.icon}
            </div>
            <span
              className={`text-[10px] text-center leading-tight ${
                selectedId === shortcut.id ? 'text-white' : 'text-[var(--window-text)]'
              }`}
            >
              {shortcut.name}
            </span>
          </div>
        ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-[var(--button-shadow)] bg-[var(--button-face)]">
        <span className="text-xs text-[var(--window-text)]">{shortcuts.length} items</span>
        <span className="text-[9px] text-gray-500">Double-click to open</span>
      </div>
    </div>
  );
}
