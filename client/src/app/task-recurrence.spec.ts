import { defaultCustomDays, defaultMonthDays, nextRecurrenceDue, normalizeRecurrence } from './task-recurrence';

describe('task-recurrence', () => {
  it('normalizes recurrence rules', () => {
    expect(normalizeRecurrence('daily')).toBe('daily');
    expect(normalizeRecurrence('weekly')).toBe('weekly');
    expect(normalizeRecurrence('weekends')).toBe('weekends');
    expect(normalizeRecurrence('custom')).toBe('custom');
    expect(normalizeRecurrence('invalid')).toBe(null);
  });

  it('computes next daily due date', () => {
    expect(nextRecurrenceDue('daily', '2026-06-25', '2026-06-25')).toBe('2026-06-26');
  });

  it('computes next weekly due date', () => {
    expect(nextRecurrenceDue('weekly', '2026-06-25', '2026-06-25')).toBe('2026-07-02');
  });

  it('computes next weekend due date', () => {
    expect(nextRecurrenceDue('weekends', '2026-06-25', '2026-06-25')).toBe('2026-06-27');
  });

  it('computes next custom due date', () => {
    expect(nextRecurrenceDue('custom', '2026-06-25', '2026-06-25', [1, 3])).toBe('2026-06-29');
  });

  it('computes next monthly due date from selected month days', () => {
    expect(nextRecurrenceDue('monthly', '2026-06-25', '2026-06-25', null, [1, 15])).toBe('2026-07-01');
  });

  it('defaults custom days from due date', () => {
    expect(defaultCustomDays('2026-06-25')).toEqual([4]);
  });

  it('defaults month days from due date', () => {
    expect(defaultMonthDays('2026-06-25')).toEqual([25]);
  });
});
