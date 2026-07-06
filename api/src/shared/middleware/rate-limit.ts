// Simple in-memory sliding-window rate limiter, keyed per-IP.
// auth routes: 10/min; general: 100/min. No Redis (B1).
import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.ts';

type Bucket = number[]; // timestamps (ms)

const WINDOW_MS = 60_000;

export function createRateLimiter(limit: number) {
  const buckets = new Map<string, Bucket>();
  return function check(req: FastifyRequest): void {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
    if (hits.length >= limit) {
      throw new AppError('RATE_LIMITED', 'Too many requests');
    }
    hits.push(now);
    buckets.set(key, hits);
  };
}

// Disable via env for deterministic tests (limits are exercised in a dedicated test).
export function rateLimitEnabled(): boolean {
  return process.env.DISABLE_RATE_LIMIT !== '1';
}
