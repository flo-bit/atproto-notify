/**
 * KV-backed fixed-window rate limiting.
 *
 * Each key holds the current count as the value, plus `metadata.expiresAt` (the
 * unix-ms instant the logical window ends). We track the window end in metadata
 * — rather than relying solely on KV's `expirationTtl` — because Cloudflare KV
 * enforces a 60-second minimum TTL, yet some windows here are sub-minute (the
 * per-pair "1 request/second" send limit). So the physical TTL is clamped to
 * >= 60s, while window expiry is decided logically from `expiresAt`.
 *
 * KV is eventually consistent, so concurrent requests across colos can slightly
 * over-count. That's acceptable for these limits.
 */

const KV_MIN_TTL_SECONDS = 60;

export interface RateLimitResult {
  /** Whether this request is within the limit (the count after incrementing). */
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Seconds until the current window resets. */
  resetIn: number;
}

interface CounterMetadata {
  expiresAt: number;
}

export async function checkAndIncrement(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const { value, metadata } = await kv.getWithMetadata<CounterMetadata>(key, 'text');

  // Window is active when a value exists and its logical expiry is in the future.
  const windowActive =
    value !== null && metadata !== null && metadata.expiresAt > nowMs;

  let count: number;
  let expiresAt: number;
  if (windowActive) {
    count = Number.parseInt(value, 10) + 1;
    expiresAt = metadata.expiresAt;
  } else {
    // Start a fresh window (also covers the "logically expired but physically
    // still present" case, since we ignore the stale value).
    count = 1;
    expiresAt = nowMs + windowSeconds * 1000;
  }

  const resetInSeconds = Math.max(1, Math.ceil((expiresAt - nowMs) / 1000));
  const physicalTtl = Math.max(KV_MIN_TTL_SECONDS, resetInSeconds);

  await kv.put(key, String(count), {
    expirationTtl: physicalTtl,
    metadata: { expiresAt } satisfies CounterMetadata,
  });

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetIn: resetInSeconds,
  };
}

/** One cap in a multi-key check. */
export interface RateCheck {
  key: string;
  limit: number;
  windowSeconds: number;
}

/**
 * All-or-nothing fixed-window check across several keys. Reads every counter; if
 * ANY is already at/over its limit, denies WITHOUT incrementing any of them;
 * otherwise increments all. This gates one action behind multiple caps at once
 * (e.g. a per-recipient AND a relay-global daily channel cap) without burning a
 * slot from one cap when a different one is what blocks. Same KV
 * eventual-consistency caveat as {@link checkAndIncrement}.
 */
export async function checkAndIncrementAll(
  kv: KVNamespace,
  checks: readonly RateCheck[],
): Promise<{ allowed: boolean }> {
  if (checks.length === 0) return { allowed: true };
  const nowMs = Date.now();

  const states = await Promise.all(
    checks.map(async (c) => {
      const { value, metadata } = await kv.getWithMetadata<CounterMetadata>(c.key, 'text');
      if (value !== null && metadata !== null && metadata.expiresAt > nowMs) {
        return { key: c.key, limit: c.limit, count: Number.parseInt(value, 10), expiresAt: metadata.expiresAt };
      }
      return { key: c.key, limit: c.limit, count: 0, expiresAt: nowMs + c.windowSeconds * 1000 };
    }),
  );

  if (states.some((s) => s.count >= s.limit)) {
    return { allowed: false };
  }

  await Promise.all(
    states.map((s) => {
      const resetIn = Math.max(1, Math.ceil((s.expiresAt - nowMs) / 1000));
      return kv.put(s.key, String(s.count + 1), {
        expirationTtl: Math.max(KV_MIN_TTL_SECONDS, resetIn),
        metadata: { expiresAt: s.expiresAt } satisfies CounterMetadata,
      });
    }),
  );
  return { allowed: true };
}
