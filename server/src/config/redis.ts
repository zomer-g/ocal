import IORedis from 'ioredis';
import { env } from './env.js';

let redis: IORedis | null = null;

try {
  redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true,
  });
} catch {
  console.warn('Redis not available — queue features disabled');
}

export { redis };
