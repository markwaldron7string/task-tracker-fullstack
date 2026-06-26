export type RecurrenceRule = 'daily' | 'weekdays' | 'weekends' | 'monthly' | 'custom' | 'weekly';

export const RECURRENCE_OPTIONS: Array<{ value: RecurrenceRule; label: string }> = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'custom', label: 'Custom' },
  { value: 'monthly', label: 'Every month' },
];

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

export const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export function defaultMonthDays(fromIso: string | null): number[] {
  const ref = fromIso ? parseIso(fromIso) : new Date();
  return [ref.getDate()];
}

export function monthDayGridCells(): Array<number | null> {
  const cells: Array<number | null> = MONTH_DAYS.map(day => day);
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function normalizeRecurrence(value: unknown): RecurrenceRule | null {
  if (
    value === 'daily'
    || value === 'weekly'
    || value === 'weekdays'
    || value === 'weekends'
    || value === 'monthly'
    || value === 'custom'
  ) {
    return value;
  }
  return null;
}

export function recurrenceLabel(
  rule: RecurrenceRule | null,
  customDays?: number[] | null,
  monthDays?: number[] | null
): string {
  if (!rule) return '';
  if (rule === 'custom' && customDays?.length) {
    const labels = customDays
      .slice()
      .sort((a, b) => a - b)
      .map(day => WEEKDAY_LABELS[day] ?? '?');
    return `Custom (${labels.join(', ')})`;
  }
  if (rule === 'monthly' && monthDays?.length) {
    const labels = monthDays.slice().sort((a, b) => a - b).join(', ');
    return `Every month (${labels})`;
  }
  if (rule === 'weekly') return 'Every week';
  return RECURRENCE_OPTIONS.find(option => option.value === rule)?.label ?? rule;
}

export function defaultCustomDays(fromIso: string | null): number[] {
  const ref = fromIso ? parseIso(fromIso) : new Date();
  return [ref.getDay()];
}

function parseIso(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Compute the next due date after completing a recurring task. */
export function nextRecurrenceDue(
  rule: RecurrenceRule,
  fromDue: string | null,
  referenceIso: string,
  weekdayDays: number[] | null = null,
  monthDays: number[] | null = null
): string {
  const anchor = fromDue ? parseIso(fromDue) : parseIso(referenceIso);
  const cursorStart = addDays(anchor, 1);

  if (rule === 'daily') {
    return toIso(cursorStart);
  }

  if (rule === 'weekly') {
    return toIso(addDays(anchor, 7));
  }

  if (rule === 'monthly') {
    const days = monthDays?.length ? monthDays : [anchor.getDate()];
    let cursor = cursorStart;
    for (let i = 0; i < 366; i += 1) {
      if (days.includes(cursor.getDate())) return toIso(cursor);
      cursor = addDays(cursor, 1);
    }
    const next = new Date(anchor);
    next.setMonth(next.getMonth() + 1);
    return toIso(next);
  }

  if (rule === 'weekends') {
    let cursor = cursorStart;
    while (!isWeekend(cursor)) {
      cursor = addDays(cursor, 1);
    }
    return toIso(cursor);
  }

  if (rule === 'custom') {
    const days = weekdayDays?.length ? weekdayDays : [anchor.getDay()];
    let cursor = cursorStart;
    for (let i = 0; i < 14; i += 1) {
      if (days.includes(cursor.getDay())) return toIso(cursor);
      cursor = addDays(cursor, 1);
    }
    return toIso(cursorStart);
  }

  // weekdays
  let cursor = cursorStart;
  while (!isWeekday(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return toIso(cursor);
}
