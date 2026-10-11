import { createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';

// Colleagues sharing an office connection get independent account budgets.
// A separate IP budget still limits attempts across many account names.
export function loginRateLimits() {
  const common = { windowMs: 15 * 60 * 1000, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again later.' } };
  return [
    rateLimit({ ...common, limit: 60 }),
    rateLimit({ ...common, limit: 5, skipSuccessfulRequests: true,
      keyGenerator: req => createHash('sha256').update(JSON.stringify([
        req.ip, typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : ''
      ])).digest('hex') })
  ];
}
