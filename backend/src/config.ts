import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  AI_MODE: z.enum(["mock", "live"]).default("mock"),
  OPENAI_API_KEY: z.string().default(""),
  GEMINI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default(""),
  CORS_ORIGINS: z.string().default("")
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
