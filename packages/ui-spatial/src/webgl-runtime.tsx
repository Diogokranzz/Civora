'use client';

import * as React from 'react';

export interface FpsDropSample {
  sceneName: string;
  fps: number;
  maxFrameMs: number;
  windowMs: number;
}

export interface SurfaceRenderSample {
  surfaceId: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDurationMs: number;
  baseDurationMs: number;
}

export function detectWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

interface WebGLBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface WebGLBoundaryState {
  hasError: boolean;
}

export class WebGLBoundary extends React.Component<WebGLBoundaryProps, WebGLBoundaryState> {
  state: WebGLBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WebGLBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // Graceful degradation handled via fallback UI.
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

/**
 * Samples browser animation frames around active WebGL canvases and emits telemetry
 * only when FPS falls below thresholdFps or a frame spike exceeds 36ms.
 */
export function useFpsMonitor(
  sceneName: string,
  enabled: boolean,
  onFpsDrop?: (sample: FpsDropSample) => void,
  thresholdFps = 45,
): void {
  const callbackRef = React.useRef(onFpsDrop);
  callbackRef.current = onFpsDrop;

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !callbackRef.current) {
      return undefined;
    }

    let rafId = 0;
    let frameCount = 0;
    let maxFrameMs = 0;
    let lastTs = performance.now();
    let windowStartTs = lastTs;

    const tick = (now: number) => {
      const delta = now - lastTs;
      lastTs = now;
      frameCount += 1;
      if (delta > maxFrameMs && frameCount > 1) {
        maxFrameMs = delta;
      }

      const elapsed = now - windowStartTs;
      if (elapsed >= 2000) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        if (fps < thresholdFps || maxFrameMs > 42) {
          callbackRef.current?.({
            sceneName,
            fps,
            maxFrameMs: Number(maxFrameMs.toFixed(2)),
            windowMs: Math.round(elapsed),
          });
        }
        frameCount = 0;
        maxFrameMs = 0;
        windowStartTs = now;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [enabled, sceneName, thresholdFps]);
}

export interface GlassSurfaceProfilerProps {
  surfaceId?: string;
  onSurfaceRender?: (sample: SurfaceRenderSample) => void;
  children: React.ReactNode;
}

export function GlassSurfaceProfiler({
  surfaceId,
  onSurfaceRender,
  children,
}: GlassSurfaceProfilerProps) {
  const handleRender: React.ProfilerOnRenderCallback = React.useCallback(
    (id, phase, actualDuration, baseDuration) => {
      if (!onSurfaceRender) return;
      onSurfaceRender({
        surfaceId: id,
        phase,
        actualDurationMs: Number(actualDuration.toFixed(2)),
        baseDurationMs: Number(baseDuration.toFixed(2)),
      });
    },
    [onSurfaceRender],
  );

  if (!surfaceId || !onSurfaceRender) {
    return <>{children}</>;
  }

  return (
    <React.Profiler id={surfaceId} onRender={handleRender}>
      {children}
    </React.Profiler>
  );
}

