export interface BusinessShift {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export interface BusinessCalendarConfig {
  timezone: string;
  shifts: BusinessShift[];
  holidayDates: string[]; // "YYYY-MM-DD" in calendar timezone
}

export interface TimeInterval {
  start: Date;
  end: Date;
}

interface MinuteSpan {
  startMin: number;
  endMin: number;
}

function parseHHmm(value: string): number {
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 24 || m < 0 || m > 59) {
    throw new Error(`Invalid HH:mm time string: ${value}`);
  }
  return h * 60 + m;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
  dateKey: string;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      map.set(part.type, part.value);
    }
  }
  const year = Number(map.get('year'));
  const month = Number(map.get('month'));
  const day = Number(map.get('day'));
  let hour = Number(map.get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(map.get('minute'));
  const second = Number(map.get('second'));
  const weekdayStr = map.get('weekday') ?? 'Mon';
  const dayOfWeek = WEEKDAY_MAP[weekdayStr] ?? 1;
  const dateKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, hour, minute, second, dayOfWeek, dateKey };
}

function getTimezoneOffsetMs(utcDate: Date, timeZone: string): number {
  const parts = getZonedParts(utcDate, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(utcDate.getTime() / 1000) * 1000;
}

function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset1 = getTimezoneOffsetMs(new Date(naiveUtcMs), timeZone);
  const candidate = new Date(naiveUtcMs - offset1);
  const offset2 = getTimezoneOffsetMs(candidate, timeZone);
  return new Date(naiveUtcMs - offset2);
}

function getMergedDaySpans(
  dayOfWeek: number,
  dateKey: string,
  calendar: BusinessCalendarConfig,
  holidays: ReadonlySet<string>,
): MinuteSpan[] {
  if (holidays.has(dateKey)) {
    return [];
  }
  const raw = calendar.shifts
    .filter((s) => s.dayOfWeek === dayOfWeek)
    .map((s) => ({ startMin: parseHHmm(s.startTime), endMin: parseHHmm(s.endTime) }))
    .filter((s) => s.endMin > s.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  if (raw.length === 0) return [];
  const merged: MinuteSpan[] = [raw[0]!];
  for (let i = 1; i < raw.length; i++) {
    const curr = raw[i]!;
    const last = merged[merged.length - 1]!;
    if (curr.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, curr.endMin);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

function nextCalendarDay(year: number, month: number, day: number): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  dateKey: string;
} {
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  const y = next.getUTCFullYear();
  const m = next.getUTCMonth() + 1;
  const d = next.getUTCDate();
  return {
    year: y,
    month: m,
    day: d,
    dayOfWeek: next.getUTCDay(),
    dateKey: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

export class SlaClockCalculator {
  static addBusinessMinutes(
    startAt: Date,
    minutesToAdd: number,
    calendar: BusinessCalendarConfig,
  ): Date {
    if (minutesToAdd <= 0) {
      return new Date(startAt.getTime());
    }

    const holidays = new Set(calendar.holidayDates);
    const hasAnyShift = calendar.shifts.some((s) => parseHHmm(s.endTime) > parseHHmm(s.startTime));
    if (!hasAnyShift) {
      return new Date(startAt.getTime() + minutesToAdd * 60_000);
    }

    let remainingMs = minutesToAdd * 60_000;
    const startZoned = getZonedParts(startAt, calendar.timezone);
    let cursorDay = {
      year: startZoned.year,
      month: startZoned.month,
      day: startZoned.day,
      dayOfWeek: startZoned.dayOfWeek,
      dateKey: startZoned.dateKey,
    };

    let guardDays = 0;
    while (remainingMs > 0 && guardDays < 3650) {
      const spans = getMergedDaySpans(cursorDay.dayOfWeek, cursorDay.dateKey, calendar, holidays);
      for (const span of spans) {
        const spanStartUtc = zonedWallClockToUtc(
          cursorDay.year,
          cursorDay.month,
          cursorDay.day,
          span.startMin,
          calendar.timezone,
        );
        const spanEndUtc = zonedWallClockToUtc(
          cursorDay.year,
          cursorDay.month,
          cursorDay.day,
          span.endMin,
          calendar.timezone,
        );

        const effectiveStartMs =
          guardDays === 0 ? Math.max(startAt.getTime(), spanStartUtc.getTime()) : spanStartUtc.getTime();
        const effectiveEndMs = spanEndUtc.getTime();

        if (effectiveEndMs > effectiveStartMs) {
          const availableMs = effectiveEndMs - effectiveStartMs;
          if (remainingMs <= availableMs) {
            return new Date(effectiveStartMs + remainingMs);
          }
          remainingMs -= availableMs;
        }
      }

      cursorDay = nextCalendarDay(cursorDay.year, cursorDay.month, cursorDay.day);
      guardDays += 1;
    }

    return new Date(startAt.getTime() + minutesToAdd * 60_000);
  }

  static calculateBusinessMinutesBetween(
    startAt: Date,
    endAt: Date,
    calendar: BusinessCalendarConfig,
    pausedIntervals: TimeInterval[] = [],
  ): number {
    if (endAt.getTime() <= startAt.getTime()) {
      return 0;
    }

    const holidays = new Set(calendar.holidayDates);
    const hasAnyShift = calendar.shifts.some((s) => parseHHmm(s.endTime) > parseHHmm(s.startTime));
    if (!hasAnyShift) {
      const activeMs = subtractIntervals(startAt.getTime(), endAt.getTime(), pausedIntervals);
      return Math.floor(activeMs / 60_000);
    }

    const startZoned = getZonedParts(startAt, calendar.timezone);
    const endZoned = getZonedParts(endAt, calendar.timezone);
    let cursorDay = {
      year: startZoned.year,
      month: startZoned.month,
      day: startZoned.day,
      dayOfWeek: startZoned.dayOfWeek,
      dateKey: startZoned.dateKey,
    };

    let totalActiveMs = 0;
    let guardDays = 0;
    while (guardDays < 3650) {
      const spans = getMergedDaySpans(cursorDay.dayOfWeek, cursorDay.dateKey, calendar, holidays);
      for (const span of spans) {
        const spanStartUtc = zonedWallClockToUtc(
          cursorDay.year,
          cursorDay.month,
          cursorDay.day,
          span.startMin,
          calendar.timezone,
        );
        const spanEndUtc = zonedWallClockToUtc(
          cursorDay.year,
          cursorDay.month,
          cursorDay.day,
          span.endMin,
          calendar.timezone,
        );

        const segStart = Math.max(startAt.getTime(), spanStartUtc.getTime());
        const segEnd = Math.min(endAt.getTime(), spanEndUtc.getTime());

        if (segEnd > segStart) {
          totalActiveMs += subtractIntervals(segStart, segEnd, pausedIntervals);
        }
      }

      if (cursorDay.dateKey >= endZoned.dateKey) {
        break;
      }
      cursorDay = nextCalendarDay(cursorDay.year, cursorDay.month, cursorDay.day);
      guardDays += 1;
    }

    return Math.floor(totalActiveMs / 60_000);
  }
}

function subtractIntervals(
  rangeStartMs: number,
  rangeEndMs: number,
  pausedIntervals: TimeInterval[],
): number {
  if (rangeEndMs <= rangeStartMs) return 0;
  const relevant = pausedIntervals
    .map((p) => ({
      start: Math.max(rangeStartMs, p.start.getTime()),
      end: Math.min(rangeEndMs, p.end.getTime()),
    }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start);

  if (relevant.length === 0) {
    return rangeEndMs - rangeStartMs;
  }

  let totalPaused = 0;
  let curStart = relevant[0]!.start;
  let curEnd = relevant[0]!.end;
  for (let i = 1; i < relevant.length; i++) {
    const next = relevant[i]!;
    if (next.start <= curEnd) {
      curEnd = Math.max(curEnd, next.end);
    } else {
      totalPaused += curEnd - curStart;
      curStart = next.start;
      curEnd = next.end;
    }
  }
  totalPaused += curEnd - curStart;

  return Math.max(0, rangeEndMs - rangeStartMs - totalPaused);
}

