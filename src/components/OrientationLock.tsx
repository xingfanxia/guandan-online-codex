export type OrientationMode = 'landscape' | 'portrait-rotated' | 'portrait-prompt';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface OrientationLockProps {
  children: React.ReactNode;
  viewport?: ViewportSize;
  canRotate?: boolean;
}

export function resolveOrientationMode({
  width,
  height,
  canRotate,
}: ViewportSize & { canRotate: boolean }): OrientationMode {
  if (width >= height) return 'landscape';
  return canRotate ? 'portrait-rotated' : 'portrait-prompt';
}

export function OrientationLock({
  children,
  viewport,
  canRotate = true,
}: OrientationLockProps): React.ReactElement {
  const size = viewport ?? currentViewport();
  const mode = resolveOrientationMode({ ...size, canRotate });

  if (mode === 'portrait-prompt') {
    return (
      <div className="gdo-orientation gdo-orientation--portrait-prompt" data-orientation-mode={mode}>
        <div className="gdo-rotate-prompt" role="status">
          <span className="gdo-rotate-prompt__title">请横屏继续</span>
          <span className="gdo-rotate-prompt__body">Guandan Online uses a landscape table layout.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={['gdo-orientation', `gdo-orientation--${mode}`].join(' ')}
      data-orientation-mode={mode}
      aria-label="Landscape game viewport"
      style={{
        '--logical-w': `${size.width}px`,
        '--logical-h': `${size.height}px`,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

function currentViewport(): ViewportSize {
  if (typeof window === 'undefined') return { width: 852, height: 393 };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}
