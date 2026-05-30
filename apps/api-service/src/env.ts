import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.string().default('info'),

  // Database
  DB_PRIMARY_URL: z.string().url(),
  DB_REPLICA_URL: z.string().url().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Kafka
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('api-service'),

  // Auth — Keycloak JWKS
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_JWKS_URI: z.string().url(),

  // Internal service URLs
  PM_GRPC_HOST: z.string().default('pm-service:50051'),
  AI_SERVICE_URL: z.string().url().default('http://ai-service:8001'),
  MESSAGING_SERVICE_URL: z.string().url().default('http://messaging-service:3002'),

  // S3 / MinIO
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET_ATTACHMENTS: z.string().default('ctm-attachments'),
  S3_BUCKET_EXPORTS: z.string().default('ctm-exports'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Internal service token secret
  INTERNAL_TOKEN_SECRET: z.string().min(32),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
