
import "dotenv/config";

const port = Number(process.env.PORT || 5001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number");
}

export const env = {
  PORT: port,
  NODE_ENV: process.env.NODE_ENV || "development",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  MONGODB_URI: process.env.MONGODB_URI?.trim() || "",
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || "wedplan",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  IMGBB_API_KEY: process.env.IMGBB_API_KEY || "",
};
