import rateLimit from 'express-rate-limit';

// Global concurrency-aware rate limit across all IPs to protect the connection pool.
// Bots like Googlebot use many IPs, so per-IP limits alone are insufficient.
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'global',
  message: { error: 'Server is under heavy load, please try again shortly' },
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

export const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

export const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download requests, please try again later' },
});
