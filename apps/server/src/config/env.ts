/**
 * Server configuration, read from environment variables and validated once
 * at startup.
 *
 * "Fail fast": if a required setting is missing or unsafe (like a short JWT
 * secret), the server refuses to start with a clear message, instead of
 * starting and breaking later at some random request.
 */
import { z } from "zod";

/** At least 32 characters: shorter secrets make JWTs easier to forge by brute force. */
export const MIN_JWT_SECRET_LENGTH = 32;

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Env values are always text, so "4000" is coerced to the number 4000.
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z
    .string({ message: "is required" })
    .refine((url) => /^postgres(ql)?:\/\//.test(url), {
      message: "must be a postgres:// connection string",
    }),
  // bcrypt "cost": each +1 doubles the time to hash (and to brute-force).
  // 12 takes roughly a quarter of a second, a good balance for logins.
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  JWT_SECRET: z.string({ message: "is required" }).min(MIN_JWT_SECRET_LENGTH, {
    message: `must be at least ${MIN_JWT_SECRET_LENGTH} characters (try: openssl rand -base64 48)`,
  }),
});

/** The validated settings the rest of the server uses (camelCase, typed). */
export interface Config {
  nodeEnv: "development" | "test" | "production";
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  /** bcrypt cost factor. Tests use a tiny value to stay fast. */
  bcryptRounds: number;
}

/**
 * Parses and checks environment variables.
 *
 * @param env - Defaults to `process.env`; tests pass their own object.
 * @throws Error listing every problem at once, so they can all be fixed in one go.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")} ${issue.message}`,
    );
    throw new Error(`Invalid server configuration:\n${problems.join("\n")}`);
  }

  const parsed = result.data;
  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === "production",
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    jwtSecret: parsed.JWT_SECRET,
    bcryptRounds: parsed.BCRYPT_ROUNDS,
  };
}
