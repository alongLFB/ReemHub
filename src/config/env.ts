import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "test", "production"]).default("local"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  BUSINESS_TIME_ZONE: z.string().min(1).default("Asia/Dubai"),
  AUTH_SECRET: z.string().min(32),
  FIELD_ENCRYPTION_KEY: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
}).superRefine((env, ctx) => {
  const smtpFields = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS, env.SMTP_FROM];
  if (smtpFields.some(Boolean) && smtpFields.some((value) => !value)) {
    ctx.addIssue({
      code: "custom",
      path: ["SMTP_HOST"],
      message: "SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM must be configured together",
    });
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}
