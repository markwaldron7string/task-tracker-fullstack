import { dateToIso } from './task-store';

export interface MiniCalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

export function buildMiniCalendar(year: number, month: number, selectedIso: string | null): MiniCalendarDay[] {
  const today = dateToIso(new Date());
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells: MiniCalendarDay[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const iso = dateToIso(date);
    cells.push({
      iso,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: iso === today,
      isSelected: iso === selectedIso,
    });
  }

  return cells;
}

export function parseIsoDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(trimmed + 'T00:00:00');
  return dateToIso(date) === trimmed ? trimmed : null;
}
