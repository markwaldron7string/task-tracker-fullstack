export type RecurrenceRule = 'daily' | 'weekly' | 'weekdays' | 'monthly';

export const RECURRENCE_OPTIONS: Array<{ value: RecurrenceRule; label: string }> = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

export function normalizeRecurrence(value: unknown): RecurrenceRule | null {
  if (value === 'daily' || value === 'weekly' || value === 'weekdays' || value === 'monthly') {
    return value;
  }
  return null;
}

export function recurrenceLabel(rule: RecurrenceRule | null): string {
  if (!rule) return '';
  return RECURRENCE_OPTIONS.find(option => option.value === rule)?.label ?? rule;
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

/** Compute the next due date after completing a recurring task. */
export function nextRecurrenceDue(
  rule: RecurrenceRule,
  fromDue: string | null,
  referenceIso: string
): string {
  const anchor = fromDue ? parseIso(fromDue) : parseIso(referenceIso);
  let cursor = addDays(anchor, 1);

  if (rule === 'daily') {
    return toIso(cursor);
  }

  if (rule === 'weekly') {
    return toIso(addDays(anchor, 7));
  }

  if (rule === 'monthly') {
    const next = new Date(anchor);
    next.setMonth(next.getMonth() + 1);
    return toIso(next);
  }

  // weekdays
  while (!isWeekday(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return toIso(cursor);
}
