type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const entries = new Map<string, RateLimitEntry>();

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = entries.get(key);

  if (!current || current.resetAt <= now) {
    const entry = { count: 1, resetAt: now + windowMs };
    entries.set(key, entry);
    return { allowed: true, remaining: limit - 1, resetAt: entry.resetAt };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}

export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown";
}
