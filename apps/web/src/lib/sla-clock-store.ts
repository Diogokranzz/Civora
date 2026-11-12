export type SlaClockUrgency = 'ok' | 'warning' | 'breached' | 'paused' | 'none';

export interface SlaClockSnapshot {
  label: string;
  urgency: SlaClockUrgency;
  remainingMs: number | null;
}

const listeners = new Set<() => void>();
let currentNowMs = Date.now();
let intervalHandle: ReturnType<typeof setInterval> | null = null;
const SERVER_EPOCH_MS = 0;

function ensureTimer() {
  if (intervalHandle !== null || listeners.size === 0 || typeof window === 'undefined') {
    return;
  }
  currentNowMs = Date.now();
  intervalHandle = setInterval(() => {
    currentNowMs = Date.now();
    for (const listener of listeners) {
      listener();
    }
  }, 1000);
}

function stopTimerIfUnused() {
  if (listeners.size === 0 && intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function subscribeSlaClock(listener: () => void): () => void {
  listeners.add(listener);
  ensureTimer();
  return () => {
    listeners.delete(listener);
    stopTimerIfUnused();
  };
}

export function getSlaClockSnapshot(): number {
  return currentNowMs;
}

export function getSlaClockServerSnapshot(): number {
  return SERVER_EPOCH_MS;
}

function formatDurationCompact(absMs: number): string {
  const totalSeconds = Math.floor(absMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Pure calculator turning SLA timestamps into urgency and compact duration string. */
export function computeSlaClockState(
  dueAt: string | Date | null | undefined,
  pausedAt: string | Date | null | undefined,
  isBreached: boolean | undefined,
  nowMs: number,
  warningWindowMs = 60 * 60 * 1000,
): SlaClockSnapshot {
  if (pausedAt) {
    return { label: 'Pausado', urgency: 'paused', remainingMs: null };
  }
  if (!dueAt) {
    return { label: 'Sem SLA', urgency: 'none', remainingMs: null };
  }
  if (nowMs <= 0) {
    return { label: 'Calculando...', urgency: 'ok', remainingMs: null };
  }

  const dueMs = typeof dueAt === 'string' ? Date.parse(dueAt) : dueAt.getTime();
  if (!Number.isFinite(dueMs)) {
    return { label: 'Sem SLA', urgency: 'none', remainingMs: null };
  }

  const remainingMs = dueMs - nowMs;
  if (isBreached || remainingMs <= 0) {
    const overdue = Math.abs(Math.min(0, remainingMs));
    return {
      label: overdue > 0 ? `Estourado (-${formatDurationCompact(overdue)})` : 'Estourado',
      urgency: 'breached',
      remainingMs,
    };
  }

  if (remainingMs <= warningWindowMs) {
    return {
      label: `${formatDurationCompact(remainingMs)} rest.`,
      urgency: 'warning',
      remainingMs,
    };
  }

  return {
    label: `${formatDurationCompact(remainingMs)} rest.`,
    urgency: 'ok',
    remainingMs,
  };
}

