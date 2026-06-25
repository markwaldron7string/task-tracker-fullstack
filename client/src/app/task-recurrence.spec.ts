import { nextRecurrenceDue, normalizeRecurrence } from './task-recurrence';

describe('task-recurrence', () => {
  it('normalizes recurrence rules', () => {
    expect(normalizeRecurrence('daily')).toBe('daily');
    expect(normalizeRecurrence('weekly')).toBe('weekly');
    expect(normalizeRecurrence('invalid')).toBe(null);
  });

  it('computes next daily due date', () => {
    expect(nextRecurrenceDue('daily', '2026-06-25', '2026-06-25')).toBe('2026-06-26');
  });

  it('computes next weekly due date', () => {
    expect(nextRecurrenceDue('weekly', '2026-06-25', '2026-06-25')).toBe('2026-07-02');
  });
});
