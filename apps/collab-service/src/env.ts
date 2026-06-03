import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(1234),
  DB_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().url().default('http://localhost/'),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().default(300_000),  // 5 min
  DEBOUNCE_WRITE_MS: z.coerce.number().default(500),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Invalid env:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
