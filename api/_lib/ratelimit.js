// Shared guest rate limiter for the public tour endpoints.
//
// Keyed on a sha256 hash of the visitor's IP (the raw IP never leaves the
// serverless function and is never stored). Counting happens in Supabase via
// the check_and_record_guest_usage RPC (migration 0014), called with the
// service-role key — the same pattern the /api/track endpoint already uses.
//
// DESIGN RULE: this must NEVER break the tour. Every failure path — missing
// env vars, Supabase down, slow response, unexpected payload — returns
// { allowed: true }. The limiter only ever blocks when Supabase positively
// says "over the limit". A 1.5s timeout caps any latency it can add.
//
// Files under api/_lib/ are not exposed as endpoints by Vercel.

import crypto from 'node:crypto';

// Per-IP limits. Deliberately generous: UK mobile networks put many visitors
// behind one shared IP (CGNAT), so a whole tour group can share a key.
// These stop runaway abuse, not enthusiastic legitimate use.
const LIMITS = {
  chat:       { perMinute: 15, perDay: 200 },
  tts:        { perMinute: 40, perDay: 600 },
  findnearby: { perMinute: 10, perDay: 100 },
};

function clientIp(req) {
  // Vercel puts the real client IP first in x-forwarded-for.
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    return xff.split(',')[0].trim();
  }
  return String(req.headers['x-real-ip'] || req.socket?.remoteAddress || '');
}

/**
 * Check whether this request is within limits and record it.
 * @param {object} req  - the incoming request
 * @param {string} action - 'chat' | 'tts' | 'findnearby'
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export async function checkGuestRateLimit(req, action) {
  const limits = LIMITS[action];
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!limits || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: true, reason: 'not_configured' };
  }

  const ip = clientIp(req);
  if (!ip) return { allowed: true, reason: 'no_ip' };
  const key = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 40);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/check_and_record_guest_usage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          p_key: key,
          p_action: action,
          p_per_minute: limits.perMinute,
          p_per_day: limits.perDay,
        }),
        signal: controller.signal,
      }
    );
    if (!resp.ok) return { allowed: true, reason: 'rpc_error' };
    const data = await resp.json();
    if (data && data.allowed === false) {
      return { allowed: false, reason: data.reason || 'limited' };
    }
    return { allowed: true };
  } catch (e) {
    // Timeout, network error, anything unexpected: fail open.
    return { allowed: true, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a friendly 429. Cache-Control: no-store is essential on the TTS route —
 * without it a 429 could be cached at the CDN edge and break that audio clip
 * for every later visitor.
 */
export function sendRateLimited(res, reason) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Retry-After', reason === 'day' ? '3600' : '60');
  return res.status(429).json({
    error: 'rate_limited',
    reason,
    message:
      'You have been exploring at quite a pace! Give it a minute and try again.',
  });
}
