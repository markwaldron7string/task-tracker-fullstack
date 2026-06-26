import { configToTimestamp } from './task-reminder.service';

describe('configToTimestamp', () => {
  it('returns the configured local date and time', () => {
    const expected = new Date('2026-06-25T09:00:00');
    expect(
      configToTimestamp({ remindDate: '2026-06-25', remindTime: '09:00' })
    ).toBe(expected.getTime());
  });
});
