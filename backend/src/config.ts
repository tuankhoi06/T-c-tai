import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  AI_MODE: z.enum(["mock", "live"]).default("mock"),
  OPENAI_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default(""),
  STORAGE_MODE: z.enum(["auto", "memory"]).default("auto"),
  CORS_ORIGINS: z.string().default(""),
  SUPABASE_URL: z.union([z.literal(""), z.string().url()]).default(""),
  SUPABASE_SECRET_KEY: z.string().default("")
}).superRefine((value, context) => {
  if (Boolean(value.SUPABASE_URL) !== Boolean(value.SUPABASE_SECRET_KEY)) {
    context.addIssue({
      code: "custom",
      path: ["SUPABASE_SECRET_KEY"],
      message: "SUPABASE_URL and SUPABASE_SECRET_KEY must both be configured."
    });
  }
});

export const config = schema.parse(process.env);

if (config.AI_MODE === "live") {
  const hasKey = config.OPENAI_API_KEY || config.GEMINI_API_KEY;
  if (!hasKey) {
    throw new Error(
      "AI_MODE=live yêu cầu OPENAI_API_KEY hoặc GEMINI_API_KEY trong backend/.env"
    );
  }
}

export const SHOP_ZONE = "Asia/Ho_Chi_Minh";
