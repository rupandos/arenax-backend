import { describe, it, expect } from 'vitest';
import {
  exponentialBackoffDelay,
  attemptsExhausted,
  REWARD_MAX_ATTEMPTS,
} from '../src/utils/backoff';

describe('reward retry backoff', () => {
  it('grows the delay ceiling exponentially with attempt count', () => {
    const attempt0 = exponentialBackoffDelay(0, 1000, 60_000);
    const attempt5 = exponentialBackoffDelay(5, 1000, 60_000);
    expect(attempt0).toBeGreaterThanOrEqual(0);
    expect(attempt0).toBeLessThan(1000);
    expect(attempt5).toBeLessThanOrEqual(60_000);
    expect(attempt5).toBeGreaterThanOrEqual(0);
  });

  it('caps the ceiling at maxMs', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(exponentialBackoffDelay(attempt, 1000, 60_000)).toBeLessThanOrEqual(60_000);
    }
  });

  it('applies jitter (not a fixed value)', () => {
    const samples = new Set(
      Array.from({ length: 20 }, () => exponentialBackoffDelay(3, 1000, 60_000)),
    );
    expect(samples.size).toBeGreaterThan(1);
  });

  it('marks attempts exhausted at the configured limit', () => {
    expect(attemptsExhausted(REWARD_MAX_ATTEMPTS)).toBe(true);
    expect(attemptsExhausted(REWARD_MAX_ATTEMPTS - 1)).toBe(false);
  });
});
