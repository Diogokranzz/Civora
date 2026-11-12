export type RealtimeTopic = 'tickets' | 'metrics' | 'notifications' | 'assets';

export interface RealtimeBatchFlush {
  topics: Set<RealtimeTopic>;
  ticketIds: Set<string>;
  coalescedCount: number;
  droppedCount: number;
}

export interface RealtimeBatcherOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  maxQueueDepth?: number;
  onFlush: (batch: RealtimeBatchFlush) => void;
}

/**
 * Coalesces high-frequency WebSocket events using hybrid debounce + maxWait
 * with low-overhead timer throttling so thousands of WS messages/sec do not
 * churn V8 timer objects or block main-thread INP.
 */
export class RealtimeEventBatcher {
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly maxQueueDepth: number;
  private readonly onFlush: (batch: RealtimeBatchFlush) => void;

  private topics = new Set<RealtimeTopic>();
  private ticketIds = new Set<string>();
  private coalescedCount = 0;
  private droppedCount = 0;

  private lastEventAt = 0;
  private timerArmedAt = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RealtimeBatcherOptions) {
    this.debounceMs = options.debounceMs ?? 250;
    this.maxWaitMs = options.maxWaitMs ?? 1000;
    this.maxQueueDepth = options.maxQueueDepth ?? 500;
    this.onFlush = options.onFlush;
  }

  enqueue(topics: readonly RealtimeTopic[], ticketId?: string): void {
    const now = Date.now();
    this.lastEventAt = now;

    for (const topic of topics) {
      this.topics.add(topic);
    }

    if (ticketId) {
      if (this.ticketIds.size < this.maxQueueDepth) {
        this.ticketIds.add(ticketId);
      } else {
        this.droppedCount += 1;
      }
    }

    this.coalescedCount += 1;

    if (this.debounceTimer === null) {
      this.armDebounceTimer(this.debounceMs, now);
    } else if (now - this.timerArmedAt >= 40) {
      clearTimeout(this.debounceTimer);
      this.armDebounceTimer(this.debounceMs, now);
    }

    if (this.maxWaitTimer === null) {
      this.maxWaitTimer = setTimeout(() => {
        this.flushNow();
      }, this.maxWaitMs);
    }
  }

  private armDebounceTimer(delayMs: number, armedAt: number): void {
    this.timerArmedAt = armedAt;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const sinceLast = Date.now() - this.lastEventAt;
      if (sinceLast < this.debounceMs) {
        this.armDebounceTimer(this.debounceMs - sinceLast, Date.now());
        return;
      }
      this.flushNow();
    }, delayMs);
  }

  flushNow(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }

    if (this.coalescedCount === 0 && this.topics.size === 0) {
      return;
    }

    const batch: RealtimeBatchFlush = {
      topics: this.topics,
      ticketIds: this.ticketIds,
      coalescedCount: this.coalescedCount,
      droppedCount: this.droppedCount,
    };

    this.topics = new Set<RealtimeTopic>();
    this.ticketIds = new Set<string>();
    this.coalescedCount = 0;
    this.droppedCount = 0;

    this.onFlush(batch);
  }

  dispose(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
    this.topics.clear();
    this.ticketIds.clear();
    this.coalescedCount = 0;
    this.droppedCount = 0;
  }
}
