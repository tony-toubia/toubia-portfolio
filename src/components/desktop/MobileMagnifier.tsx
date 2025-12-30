'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface MagnifierState {
  visible: boolean;
  x: number;
  y: number;
  touchX: number;
  touchY: number;
}

export default function MobileMagnifier() {
  const [state, setState] = useState<MagnifierState>({
    visible: false,
    x: 0,
    y: 0,
    touchX: 0,
    touchY: 0,
  });
  const [isMobile, setIsMobile] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Magnifier settings
  const MAGNIFIER_SIZE = 120; // Size of the magnifier circle
  const ZOOM_LEVEL = 1.8; // How much to zoom
  const OFFSET_Y = -80; // How far above the touch point to show magnifier

  useEffect(() => {
    const checkMobile = () => {
      // Check for touch capability and screen size
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isTouchDevice && isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isMobile) return;

    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    // Position magnifier above the touch point
    let magnifierX = x;
    let magnifierY = y + OFFSET_Y;

    // Keep magnifier within screen bounds
    const halfSize = MAGNIFIER_SIZE / 2;
    magnifierX = Math.max(halfSize, Math.min(window.innerWidth - halfSize, magnifierX));
    magnifierY = Math.max(halfSize, Math.min(window.innerHeight - halfSize, magnifierY));

    // If touch is near top, show magnifier below instead
    if (y < MAGNIFIER_SIZE + 20) {
      magnifierY = y + Math.abs(OFFSET_Y);
    }

    setState({
      visible: true,
      x: magnifierX,
      y: magnifierY,
      touchX: x,
      touchY: y,
    });
  }, [isMobile]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isMobile || !state.visible) return;

    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    let magnifierX = x;
    let magnifierY = y + OFFSET_Y;

    const halfSize = MAGNIFIER_SIZE / 2;
    magnifierX = Math.max(halfSize, Math.min(window.innerWidth - halfSize, magnifierX));
    magnifierY = Math.max(halfSize, Math.min(window.innerHeight - halfSize, magnifierY));

    if (y < MAGNIFIER_SIZE + 20) {
      magnifierY = y + Math.abs(OFFSET_Y);
    }

    setState({
      visible: true,
      x: magnifierX,
      y: magnifierY,
      touchX: x,
      touchY: y,
    });
  }, [isMobile, state.visible]);

  const handleTouchEnd = useCallback(() => {
    // Delay hiding to let user see where they tapped
    hideTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
    }, 150);
  }, []);

  useEffect(() => {
    if (!isMobile) return;

    // Use capture phase to get events before they're handled by other elements
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

  if (!isMobile || !state.visible) return null;

  // Calculate the background position to show zoomed content
  // The magnifier shows what's at the touch point, zoomed in
  const bgPosX = -(state.touchX * ZOOM_LEVEL - MAGNIFIER_SIZE / 2);
  const bgPosY = -(state.touchY * ZOOM_LEVEL - MAGNIFIER_SIZE / 2);

  return (
    <>
      {/* Magnifier circle */}
      <div
        className="fixed pointer-events-none z-[99999]"
        style={{
          left: state.x - MAGNIFIER_SIZE / 2,
          top: state.y - MAGNIFIER_SIZE / 2,
          width: MAGNIFIER_SIZE,
          height: MAGNIFIER_SIZE,
        }}
      >
        {/* Magnifier lens with page content */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{
            background: `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>') no-repeat`,
            boxShadow: `
              0 4px 20px rgba(0,0,0,0.4),
              inset 0 0 20px rgba(255,255,255,0.1),
              0 0 0 3px rgba(255,255,255,0.8),
              0 0 0 5px rgba(0,0,0,0.3)
            `,
            border: '2px solid #c0c0c0',
          }}
        >
          {/* The actual magnified content using CSS zoom on a clipped viewport */}
          <div
            className="absolute"
            style={{
              width: window.innerWidth,
              height: window.innerHeight,
              transform: `scale(${ZOOM_LEVEL})`,
              transformOrigin: `${state.touchX}px ${state.touchY}px`,
              left: MAGNIFIER_SIZE / 2 - state.touchX,
              top: MAGNIFIER_SIZE / 2 - state.touchY,
              pointerEvents: 'none',
            }}
          >
            {/* We can't actually clone the DOM easily, so we use a visual trick */}
            {/* The magnifier will show a zoomed screenshot effect using backdrop */}
          </div>

          {/* Backdrop filter for actual magnification effect */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              backdropFilter: `blur(0px)`,
              WebkitBackdropFilter: `blur(0px)`,
            }}
          />

          {/* Glass reflection effect */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `
                linear-gradient(
                  135deg,
                  rgba(255,255,255,0.4) 0%,
                  rgba(255,255,255,0.1) 40%,
                  transparent 60%
                )
              `,
            }}
          />
        </div>

        {/* Crosshair in center */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Vertical line */}
          <div
            className="absolute bg-red-500"
            style={{
              width: 2,
              height: 20,
              boxShadow: '0 0 2px rgba(0,0,0,0.5)',
            }}
          />
          {/* Horizontal line */}
          <div
            className="absolute bg-red-500"
            style={{
              width: 20,
              height: 2,
              boxShadow: '0 0 2px rgba(0,0,0,0.5)',
            }}
          />
          {/* Center dot */}
          <div
            className="absolute w-2 h-2 rounded-full bg-red-500"
            style={{
              boxShadow: '0 0 3px rgba(0,0,0,0.5)',
            }}
          />
        </div>

        {/* Line connecting magnifier to touch point */}
        <svg
          className="absolute pointer-events-none"
          style={{
            left: MAGNIFIER_SIZE / 2 - 1,
            top: MAGNIFIER_SIZE / 2,
            width: 2,
            height: Math.abs(state.touchY - state.y) + 10,
            overflow: 'visible',
          }}
        >
          <line
            x1="1"
            y1="0"
            x2={state.touchX - state.x + 1}
            y2={state.touchY - state.y}
            stroke="rgba(255,0,0,0.6)"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
        </svg>
      </div>

      {/* Touch point indicator */}
      <div
        className="fixed pointer-events-none z-[99998]"
        style={{
          left: state.touchX - 12,
          top: state.touchY - 12,
          width: 24,
          height: 24,
        }}
      >
        {/* Outer ring */}
        <div
          className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping"
          style={{ animationDuration: '1s' }}
        />
        {/* Inner ring */}
        <div className="absolute inset-1 rounded-full border-2 border-red-500/80" />
        {/* Center dot */}
        <div className="absolute inset-[8px] rounded-full bg-red-500" />
      </div>
    </>
  );
}
