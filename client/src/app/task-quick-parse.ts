import { Priority } from './task-store';

export interface ParsedQuickAdd {
  title: string;
  due: string | null;
  priority: Priority;
  estimateMinutes: number | null;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  low: 'low',
  medium: 'medium',
  med: 'medium',
  high: 'high',
  urgent: 'high',
  asap: 'high',
};

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function nextWeekday(targetDay: number): string {
  const d = new Date();
  const current = d.getDay();
  let delta = (targetDay - current + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Parse natural-language hints from a quick-add string (on-device, no LLM). */
export function parseQuickAdd(raw: string): ParsedQuickAdd {
  let text = raw.trim();
  let due: string | null = null;
  let priority: Priority = 'none';
  let estimateMinutes: number | null = null;

  // Time estimate: 30m, 1h, 1.5h, 90min
  text = text.replace(/\b(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/gi, (_, n) => {
    estimateMinutes = Math.round(parseFloat(n) * 60);
    return ' ';
  });
  text = text.replace(/\b(\d+)\s*m(?:in(?:ute)?s?)?\b/gi, (_, n) => {
    estimateMinutes = parseInt(n, 10);
    return ' ';
  });

  // Bang priority: !!! high, !! medium, ! low
  const bangs = text.match(/!{1,3}\s*$/);
  if (bangs) {
    const count = bangs[0].trim().length;
    priority = count >= 3 ? 'high' : count === 2 ? 'medium' : 'low';
    text = text.replace(/!{1,3}\s*$/, '');
  }

  // Due phrases (order matters — longer phrases first)
  const duePatterns: Array<[RegExp, () => string]> = [
    [/\bnext\s+week\b/i, () => offsetDate(7)],
    [/\btomorrow\b/i, () => offsetDate(1)],
    [/\btoday\b/i, () => todayIso()],
    [/\bmonday\b/i, () => nextWeekday(1)],
    [/\btuesday\b/i, () => nextWeekday(2)],
    [/\bwednesday\b/i, () => nextWeekday(3)],
    [/\bthursday\b/i, () => nextWeekday(4)],
    [/\bfriday\b/i, () => nextWeekday(5)],
    [/\bsaturday\b/i, () => nextWeekday(6)],
    [/\bsunday\b/i, () => nextWeekday(0)],
  ];

  for (const [pattern, resolve] of duePatterns) {
    if (pattern.test(text)) {
      due = resolve();
      text = text.replace(pattern, ' ');
      break;
    }
  }

  // Priority words at end: "... high priority" or "... urgent"
  text = text.replace(
    /\b(low|medium|med|high|urgent|asap)(?:\s+priority)?\s*$/i,
    (_, word) => {
      const key = word.toLowerCase();
      priority = PRIORITY_WORDS[key] ?? priority;
      return ' ';
    }
  );

  const title = text.replace(/\s{2,}/g, ' ').trim();
  return { title, due, priority, estimateMinutes };
}

/** Parse a standalone time estimate string (e.g. "30m", "1.5h", "90"). */
export function parseEstimateInput(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === '—' || trimmed === '-') return null;

  const hours = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/);
  if (hours) return Math.round(parseFloat(hours[1]) * 60);

  const minutes = trimmed.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/);
  if (minutes) return parseInt(minutes[1], 10);

  const plain = trimmed.match(/^(\d+)$/);
  if (plain) return parseInt(plain[1], 10);

  return null;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00');
  return dateToIso(date) === value;
}

function dateToIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
