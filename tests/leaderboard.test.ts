import { describe, it, expect } from 'vitest';
import { periodKeyForDate } from '../src/modules/leaderboard/leaderboard.service';

describe('leaderboard period keys', () => {
  it('builds daily keys from the UTC date', () => {
    const date = new Date('2026-08-02T12:00:00Z');
    expect(periodKeyForDate(date, 'daily')).toBe('daily:2026-08-02');
  });

  it('rolls over daily keys at midnight UTC', () => {
    const before = new Date('2026-08-02T23:59:59Z');
    const after = new Date('2026-08-03T00:00:00Z');
    expect(periodKeyForDate(before, 'daily')).not.toBe(periodKeyForDate(after, 'daily'));
  });

  it('builds weekly keys with an ISO-like week label', () => {
    const date = new Date('2026-08-02T12:00:00Z');
    const key = periodKeyForDate(date, 'weekly');
    expect(key).toMatch(/^weekly:\d{4}-W\d{2}$/);
    expect(key).not.toBe(periodKeyForDate(new Date('2026-08-09T12:00:00Z'), 'weekly'));
  });

  it('produces distinct keys per period for the same date', () => {
    const date = new Date('2026-08-02T12:00:00Z');
    expect(periodKeyForDate(date, 'daily')).not.toBe(periodKeyForDate(date, 'weekly'));
  });
});
