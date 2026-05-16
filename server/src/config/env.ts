import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
dotenv.config(); // also check server/.env

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  ADMIN_EMAILS: z.string().default(''),

  OPENAI_API_KEY: z.string().default(''),
  DEEPSEEK_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o-2024-11-20'),
  /** Optional override for the Anthropic `max_tokens` cap on the PDF extractor.
   *  Leave unset to use the in-code default (16384). Useful when pinning to a
   *  model with a lower output ceiling. */
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().optional(),
  // Dedicated keys for the PDF-extraction feature. Prefer these over the
  // generic *_API_KEY values when set, so the user can keep PDF spend on a
  // separate key from entity extraction. If empty, code falls back to the
  // generic ones above.
  OPENAI_VISION_KEY: z.string().default(''),
  ANTHROPIC_MODEL_KEY: z.string().default(''),

  CKAN_BASE_URL: z.string().url().default('https://www.odata.org.il'),
  ODATA_API_KEY: z.string().default(''),

  AUTO_SCAN_ENABLED: z.coerce.boolean().default(false),
  AUTO_SCAN_INTERVAL_HOURS: z.coerce.number().min(1).max(168).default(12),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
