'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MagnifierState {
  visible: boolean;
  magnifierX: number;
  magnifierY: number;
  touchX: number;
  touchY: number;
}

export default function MobileMagnifier() {
  const [state, setState] = useState<MagnifierState>({
    visible: false,
    magnifierX: 0,
    magnifierY: 0,
    touchX: 0,
    touchY: 0,
  });
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Magnifier settings
  const MAGNIFIER_SIZE = 130;
  const ZOOM_LEVEL = 2.5;
  const OFFSET_Y = -85;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isTouchDevice && isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const calculateMagnifierPosition = useCallback((touchX: number, touchY: number) => {
    let magnifierX = touchX;
    let magnifierY = touchY + OFFSET_Y;

    const halfSize = MAGNIFIER_SIZE / 2;
    magnifierX = Math.max(halfSize + 5, Math.min(window.innerWidth - halfSize - 5, magnifierX));
    magnifierY = Math.max(halfSize + 5, Math.min(window.innerHeight - halfSize - 5, magnifierY));

    // If touch is near top, show magnifier below
    if (touchY < MAGNIFIER_SIZE + 40) {
      magnifierY = touchY + Math.abs(OFFSET_Y);
    }

    return { magnifierX, magnifierY };
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isMobile) return;

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const touch = e.touches[0];
    const touchX = touch.clientX;
    const touchY = touch.clientY;
    const { magnifierX, magnifierY } = calculateMagnifierPosition(touchX, touchY);

    setState({
      visible: true,
      magnifierX,
      magnifierY,
      touchX,
      touchY,
    });
  }, [isMobile, calculateMagnifierPosition]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isMobile) return;

    const touch = e.touches[0];
    const touchX = touch.clientX;
    const touchY = touch.clientY;
    const { magnifierX, magnifierY } = calculateMagnifierPosition(touchX, touchY);

    setState({
      visible: true,
      magnifierX,
      magnifierY,
      touchX,
      touchY,
    });
  }, [isMobile, calculateMagnifierPosition]);

  const handleTouchEnd = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
    }, 250);
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', handleTouchEnd, { capture: true });

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isMobile, handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!mounted || !isMobile || !state.visible) return null;

  // Calculate the offset for the zoomed content
  // The touch point should appear at the center of the magnifier
  const zoomedContentStyle = {
    position: 'absolute' as const,
    width: window.innerWidth,
    height: window.innerHeight,
    left: MAGNIFIER_SIZE / 2 - state.touchX * ZOOM_LEVEL,
    top: MAGNIFIER_SIZE / 2 - state.touchY * ZOOM_LEVEL,
    transform: `scale(${ZOOM_LEVEL})`,
    transformOrigin: '0 0',
    pointerEvents: 'none' as const,
  };

  const magnifierContent = (
    <>
      {/* Magnifier circle */}
      <div
        className="fixed pointer-events-none"
        style={{
          left: state.magnifierX - MAGNIFIER_SIZE / 2,
          top: state.magnifierY - MAGNIFIER_SIZE / 2,
          width: MAGNIFIER_SIZE,
          height: MAGNIFIER_SIZE,
          zIndex: 99999,
        }}
      >
        {/* Outer frame with retro styling */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(145deg, #d4d4d4, #a0a0a0)',
            boxShadow: `
              0 4px 16px rgba(0,0,0,0.4),
              inset 0 1px 0 rgba(255,255,255,0.6),
              inset 0 -1px 0 rgba(0,0,0,0.2)
            `,
            padding: 4,
          }}
        >
          {/* Inner lens container with clip */}
          <div
            className="w-full h-full rounded-full overflow-hidden relative"
            style={{
              background: '#fff',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {/* Zoomed page content using backdrop approach */}
            <div
              style={{
                ...zoomedContentStyle,
                // We'll use a CSS trick - render everything except our magnifier
                filter: 'contrast(1.05)',
              }}
            >
              {/* This div will show zoomed content via CSS */}
            </div>

            {/* Fallback: Show element info at touch point */}
            <div className="absolute inset-0 flex items-center justify-center">
              <ElementPreview touchX={state.touchX} touchY={state.touchY} zoom={ZOOM_LEVEL} size={MAGNIFIER_SIZE} />
            </div>

            {/* Glass reflection */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: `linear-gradient(
                  135deg,
                  rgba(255,255,255,0.4) 0%,
                  rgba(255,255,255,0.15) 35%,
                  transparent 50%
                )`,
              }}
            />
          </div>
        </div>

        {/* Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute bg-red-600 shadow-sm" style={{ width: 2, height: 28 }} />
          <div className="absolute bg-red-600 shadow-sm" style={{ width: 28, height: 2 }} />
          <div className="absolute w-2 h-2 rounded-full bg-red-600 border border-white shadow-md" />
        </div>

        {/* Coordinate label */}
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center"
          style={{
            bottom: -22,
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontFamily: 'monospace',
            letterSpacing: '0.5px',
          }}
        >
          {Math.round(state.touchX)}, {Math.round(state.touchY)}
        </div>
      </div>

      {/* Connecting line */}
      <svg
        className="fixed pointer-events-none"
        style={{ left: 0, top: 0, width: '100%', height: '100%', zIndex: 99998 }}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <line
          x1={state.magnifierX}
          y1={state.magnifierY}
          x2={state.touchX}
          y2={state.touchY}
          stroke="#dc2626"
          strokeWidth="2"
          strokeDasharray="5 3"
          filter="url(#glow)"
          opacity="0.8"
        />
      </svg>

      {/* Touch indicator */}
      <div
        className="fixed pointer-events-none"
        style={{
          left: state.touchX - 18,
          top: state.touchY - 18,
          width: 36,
          height: 36,
          zIndex: 99997,
        }}
      >
        {/* Animated pulse ring */}
        <div
          className="absolute inset-0 rounded-full border-2 border-red-500"
          style={{
            animation: 'magnifier-pulse 0.8s ease-out infinite',
          }}
        />
        {/* Static ring */}
        <div
          className="absolute rounded-full border-2 border-red-600"
          style={{ inset: 8 }}
        />
        {/* Center dot */}
        <div
          className="absolute rounded-full bg-red-600"
          style={{
            inset: 14,
            boxShadow: '0 0 8px rgba(220, 38, 38, 0.6)',
          }}
        />
      </div>

      <style>{`
        @keyframes magnifier-pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </>
  );

  return createPortal(magnifierContent, document.body);
}

// Component to show element preview at touch point
function ElementPreview({ touchX, touchY, zoom, size }: { touchX: number; touchY: number; zoom: number; size: number }) {
  const [elementInfo, setElementInfo] = useState<{
    tagName: string;
    text: string;
    bgColor: string;
    color: string;
    isButton: boolean;
    isLink: boolean;
    isInput: boolean;
  } | null>(null);

  useEffect(() => {
    const el = document.elementFromPoint(touchX, touchY);
    if (el && el.tagName !== 'HTML' && el.tagName !== 'BODY') {
      const style = window.getComputedStyle(el);
      const tagName = el.tagName.toLowerCase();

      // Get meaningful text
      let text = '';
      if (el instanceof HTMLElement) {
        // Try to get direct text content, not nested
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent?.trim())
          .join(' ')
          .trim();
        text = directText || el.innerText?.slice(0, 30).trim() || '';
      }

      setElementInfo({
        tagName,
        text: text.slice(0, 25) + (text.length > 25 ? '...' : ''),
        bgColor: style.backgroundColor,
        color: style.color,
        isButton: tagName === 'button' || el.getAttribute('role') === 'button',
        isLink: tagName === 'a',
        isInput: ['input', 'textarea', 'select'].includes(tagName),
      });
    } else {
      setElementInfo(null);
    }
  }, [touchX, touchY]);

  if (!elementInfo) {
    return (
      <div className="text-center text-gray-500 text-sm">
        <div className="text-2xl mb-1">👆</div>
        <div>Touch point</div>
      </div>
    );
  }

  const bgIsTransparent = elementInfo.bgColor === 'rgba(0, 0, 0, 0)' || elementInfo.bgColor === 'transparent';

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-2 rounded-full"
      style={{
        backgroundColor: bgIsTransparent ? '#f0f0f0' : elementInfo.bgColor,
      }}
    >
      {/* Icon based on element type */}
      <div className="text-2xl mb-1">
        {elementInfo.isButton ? '🔘' : elementInfo.isLink ? '🔗' : elementInfo.isInput ? '📝' : '📦'}
      </div>

      {/* Element text */}
      {elementInfo.text && (
        <div
          className="text-center font-medium px-2 leading-tight"
          style={{
            color: elementInfo.color,
            fontSize: Math.min(14, size / 10),
            maxWidth: size - 20,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {elementInfo.text}
        </div>
      )}

      {/* Tag name */}
      <div
        className="mt-1 px-2 py-0.5 rounded text-xs font-mono"
        style={{
          backgroundColor: 'rgba(0,0,0,0.1)',
          color: 'rgba(0,0,0,0.6)',
          fontSize: 9,
        }}
      >
        &lt;{elementInfo.tagName}&gt;
      </div>
    </div>
  );
}
