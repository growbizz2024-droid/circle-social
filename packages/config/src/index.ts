import { z } from "zod";
export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default("127.0.0.1"),
    DATABASE_URL: z
      .url()
      .refine(
        (v) =>
          URL.canParse(v) &&
          ["postgres:", "postgresql:"].includes(new URL(v).protocol),
      ),
    REDIS_URL: z
      .url()
      .refine(
        (v) =>
          URL.canParse(v) &&
          ["redis:", "rediss:"].includes(new URL(v).protocol),
      ),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    WEBAUTHN_RP_ID: z.string().min(1).default("localhost"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(2592000)
      .default(604800),
    GEOIP_DATABASE_PATH: z.string().min(1).optional(),
    GEOIP_PROXY_SECRET: z.string().min(32).optional(),
    AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "silent"])
      .default("info"),
  })
  .superRefine((v, ctx) => {
    if (!URL.canParse(v.WEB_ORIGIN) || !URL.canParse(v.REDIS_URL)) return;
    const origin = new URL(v.WEB_ORIGIN);
    if (
      origin.origin !== v.WEB_ORIGIN ||
      !(
        origin.hostname === v.WEBAUTHN_RP_ID ||
        origin.hostname.endsWith(`.${v.WEBAUTHN_RP_ID}`)
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Origin must match relying party",
        path: ["WEB_ORIGIN"],
      });
    if (
      v.NODE_ENV === "production" &&
      (origin.protocol !== "https:" ||
        v.WEBAUTHN_RP_ID === "localhost" ||
        !new URL(v.REDIS_URL).password)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Production requires HTTPS, a real RP ID, and Redis credentials",
        path: ["NODE_ENV"],
      });
  });
export type Environment = z.infer<typeof environmentSchema>;
export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment settings: ${[...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ")}`,
    );
  return result.data;
}
