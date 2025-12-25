'use client';

import { useState } from 'react';

const photos = [
  {
    id: 'franklin-potty',
    name: 'franklin-potty.png',
    src: '/images/franklin-potty.png',
  },
];

export default function PhotosWindow() {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<typeof photos[0] | null>(null);

  const handlePhotoDoubleClick = (photo: typeof photos[0]) => {
    setViewingPhoto(photo);
  };

  if (viewingPhoto) {
    return (
      <div className="p-2 h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--button-shadow)]">
          <button
            className="retro-button text-xs"
            onClick={() => setViewingPhoto(null)}
          >
            ← Back
          </button>
          <span className="text-xs text-[var(--window-text)]">{viewingPhoto.name}</span>
        </div>

        {/* Image Viewer */}
        <div className="flex-1 flex items-center justify-center bg-black/10 overflow-auto">
          <img
            src={viewingPhoto.src}
            alt={viewingPhoto.name}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--button-shadow)]">
        <span className="text-xs text-[var(--window-text)]">
          {photos.length} item{photos.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Photo Grid */}
      <div className="flex flex-wrap gap-4 p-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className={`flex flex-col items-center gap-1 p-2 cursor-pointer border ${
              selectedPhoto === photo.id
                ? 'bg-[var(--selection-bg)] border-[var(--selection-bg)]'
                : 'border-transparent hover:bg-[var(--button-face)]'
            }`}
            onClick={() => setSelectedPhoto(photo.id)}
            onDoubleClick={() => handlePhotoDoubleClick(photo)}
          >
            <div className="w-20 h-20 bg-[var(--button-face)] flex items-center justify-center overflow-hidden">
              <img
                src={photo.src}
                alt={photo.name}
                className="max-w-full max-h-full object-cover"
              />
            </div>
            <span
              className={`text-xs text-center max-w-[80px] truncate ${
                selectedPhoto === photo.id ? 'text-white' : 'text-[var(--window-text)]'
              }`}
            >
              {photo.name}
            </span>
          </div>
        ))}
      </div>

      {photos.length === 0 && (
        <div className="flex items-center justify-center h-32 text-[var(--window-text)] text-sm">
          No photos yet
        </div>
      )}
    </div>
  );
}
