export class RateLimiter {
  constructor({ limit = 60, windowMs = 60_000, now = Date.now } = {}) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
    this.entries = new Map()
  }

  check(key) {
    const current = this.now()
    const entry = this.entries.get(key)
    if (!entry || entry.resetAt <= current) {
      this.entries.set(key, { count: 1, resetAt: current + this.windowMs })
      this.prune(current)
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (entry.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((entry.resetAt - current) / 1000),
        ),
      }
    }
    entry.count += 1
    return { allowed: true, retryAfterSeconds: 0 }
  }

  prune(current) {
    if (this.entries.size < 1_000) {
      return
    }
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= current) {
        this.entries.delete(key)
      }
    }
  }
}
