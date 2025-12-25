'use client';

import { useState } from 'react';

interface TrashItem {
  id: string;
  name: string;
  type: string;
  reason: string;
  dateDeleted: string;
}

const trashItems: TrashItem[] = [
  {
    id: '1',
    name: 'AI_Blockchain_NFT_Metaverse_Synergy.pptx',
    type: 'PowerPoint',
    reason: 'Too many buzzwords, zero substance',
    dateDeleted: '2024-01-15',
  },
  {
    id: '2',
    name: 'chatbot_that_just_says_yes.py',
    type: 'Python Script',
    reason: 'Technically worked, ethically questionable',
    dateDeleted: '2024-02-20',
  },
  {
    id: '3',
    name: 'enterprise_ai_pilot_v47_final_FINAL.doc',
    type: 'Word Document',
    reason: 'Joined the 95% that never made it to production',
    dateDeleted: '2024-03-10',
  },
  {
    id: '4',
    name: 'uber_for_dog_walking_but_with_ai.md',
    type: 'Markdown',
    reason: 'Market research revealed dogs can\'t use apps',
    dateDeleted: '2024-04-01',
  },
  {
    id: '5',
    name: 'definitely_not_skynet.exe',
    type: 'Executable',
    reason: 'Legal said no',
    dateDeleted: '2024-05-15',
  },
  {
    id: '6',
    name: 'salesforce_implementation_no_discovery.xlsx',
    type: 'Excel',
    reason: 'Surprisingly, this approach didn\'t work',
    dateDeleted: '2024-06-01',
  },
];

export default function RecycleBinWindow() {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const selectedTrash = trashItems.find(item => item.id === selectedItem);

  return (
    <div className="p-4 text-[var(--window-text)] h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🗑️</span>
        <div>
          <h1 className="text-lg font-bold m-0">Recycle Bin</h1>
          <p className="text-xs opacity-70 m-0">Ideas that didn&apos;t make the cut</p>
        </div>
      </div>

      <div className="retro-divider" />

      <div className="flex-1 flex gap-2 min-h-0">
        {/* File list */}
        <div className="flex-1 inset overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--button-face)]">
              <tr className="text-left">
                <th className="p-1 border-r border-[var(--button-shadow)]">Name</th>
                <th className="p-1 border-r border-[var(--button-shadow)]">Type</th>
                <th className="p-1">Date Deleted</th>
              </tr>
            </thead>
            <tbody>
              {trashItems.map(item => (
                <tr
                  key={item.id}
                  className={`cursor-pointer ${selectedItem === item.id ? 'bg-[var(--selection-bg)] text-white' : 'hover:bg-[var(--selection-bg)]/20'}`}
                  onClick={() => setSelectedItem(item.id)}
                >
                  <td className="p-1">
                    <span className="mr-1">📄</span>
                    {item.name}
                  </td>
                  <td className="p-1">{item.type}</td>
                  <td className="p-1">{item.dateDeleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details panel */}
      {selectedTrash && (
        <div className="mt-2">
          <div className="group-box">
            <span className="group-box-label">Why it was deleted</span>
            <p className="text-xs m-0 italic">&quot;{selectedTrash.reason}&quot;</p>
          </div>
        </div>
      )}

      <div className="status-bar mt-2 flex justify-between">
        <span className="status-bar-field">{trashItems.length} object(s)</span>
        <span className="status-bar-field">
          {selectedItem ? '1 object selected' : 'Select an item to view details'}
        </span>
      </div>

      <p className="text-[10px] opacity-50 text-center mt-2 italic">
        * These items cannot be restored. They&apos;re here for your entertainment only.
      </p>
    </div>
  );
}
