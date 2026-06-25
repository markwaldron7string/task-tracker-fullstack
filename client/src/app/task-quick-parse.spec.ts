import { parseEstimateInput, isValidIsoDate, parseQuickAdd } from './task-quick-parse';

describe('task-quick-parse extras', () => {
  it('parses domain and recurrence hints', () => {
    const parsed = parseQuickAdd('Walk dog daily #health');
    expect(parsed.title).toBe('Walk dog');
    expect(parsed.recurrence).toBe('daily');
    expect(parsed.project).toBe('health');
  });

  it('parses hour and minute estimate inputs', () => {
    expect(parseEstimateInput('30m')).toBe(30);
    expect(parseEstimateInput('1.5h')).toBe(90);
    expect(parseEstimateInput('90')).toBe(90);
    expect(parseEstimateInput('')).toBe(null);
    expect(parseEstimateInput('nope')).toBe(null);
  });

  it('validates iso dates', () => {
    expect(isValidIsoDate('2026-06-25')).toBe(true);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
  });
});
