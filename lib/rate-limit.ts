// Request-rate and spend-budget limiting for the routes that cost real money
// (starting an Agora agent session) or hit a rate-limited third-party LLM
// (the Groq-backed summary/suggestion endpoints).
//
// Backed by Upstash Redis (REST API, works fine from Vercel's serverless
// functions — no persistent connection needed). If UPSTASH_REDIS_REST_URL/
// UPSTASH_REDIS_REST_TOKEN aren't set, every limiter below is `null` and all
// checks become no-ops — this keeps local development working without
// requiring an Upstash account, at the cost of no protection until it's
// configured. Set both in any deployed environment.

import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch (error) {
    // The Redis client validates the URL eagerly in its constructor, and
    // this module is instantiated at import time — including during Next.js's
    // build-time page-data collection, not just at request time. A malformed
    // credential (e.g. a stray quote character from a pasted .env value)
    // must not be able to break the production build or take the whole app
    // down; degrade to "rate limiting disabled," the same as unset
    // credentials, and let it be visible in logs instead.
    console.error('[rate-limit] Invalid Upstash Redis configuration, rate limiting disabled:', error);
    return null;
  }
}

const redis = getRedis();

// Starting an agent session is the expensive action (Agora agent-minutes +
// reseller STT/LLM/TTS pass-through), so it gets the tightest per-IP window.
export const inviteAgentLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '10 m'),
      prefix: 'rl:invite-agent',
      analytics: false,
    })
  : null;

// session-summary and suggest-topic only call Groq (free-tier, text-only) —
// looser windows, mainly to stop scripted abuse rather than bound real cost.
export const llmRouteLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 h'),
      prefix: 'rl:llm-route',
      analytics: false,
    })
  : null;

/**
 * Best-effort client IP for rate-limit keys. Reads the proxy headers Vercel
 * (and most reverse proxies) set; NextRequest has no reliable built-in `.ip`
 * on the Node.js runtime these routes run on. Falls back to a constant so a
 * missing header degrades to "everyone shares one bucket" rather than
 * throwing — acceptable for a demo-scale rate limit, not a security boundary.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Global daily cap on how many agent sessions this deployment will start,
 * across all callers combined — the actual ceiling on worst-case Agora
 * spend per day, independent of per-IP limits (which don't stop many
 * different IPs from each starting a few sessions). Configurable via
 * DAILY_AGENT_SESSION_BUDGET (default 20).
 */
export async function checkDailyAgentBudget(): Promise<{
  ok: boolean;
  used: number;
  limit: number;
}> {
  const limit = Number(process.env.DAILY_AGENT_SESSION_BUDGET) || 20;
  if (!redis) return { ok: true, used: 0, limit };

  const today = new Date().toISOString().slice(0, 10); // UTC date, e.g. 2026-09-16
  const key = `budget:invite-agent:${today}`;
  const used = await redis.incr(key);
  if (used === 1) {
    // First increment of the day sets expiry; a couple hours of slack past
    // 24h so a slow request right at midnight still gets cleaned up.
    await redis.expire(key, 26 * 60 * 60);
  }

  return { ok: used <= limit, used, limit };
}
