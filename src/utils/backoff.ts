import { config } from '../config/env';

export const REWARD_MAX_ATTEMPTS = config.rewards.maxAttempts;

/**
 * Exponential backoff with full jitter, capped at 60s:
 * delay = random(0, base * 2^attempt)
 */
export function exponentialBackoffDelay(attempt: number, baseMs = 1_000, maxMs = 60_000): number {
  const exponent = Math.min(attempt, 10);
  const ceiling = Math.min(baseMs * 2 ** exponent, maxMs);
  return Math.floor(Math.random() * ceiling);
}

export function bullmqBackoffOptions(baseMs = 1_000, maxMs = 60_000) {
  return {
    type: 'exponential' as const,
    delay: baseMs,
    limit: maxMs,
  };
}

export function attemptsExhausted(attemptCount: number): boolean {
  return attemptCount >= REWARD_MAX_ATTEMPTS;
}
