
import "dotenv/config";

const port = Number(process.env.PORT || 5001);
const betterAuthSecret = process.env.BETTER_AUTH_SECRET || "";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number");
}

if (betterAuthSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
}

export const env = {
  PORT: port,
  NODE_ENV: process.env.NODE_ENV || "development",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:5001",
  BETTER_AUTH_SECRET: betterAuthSecret,
  MONGODB_URI: process.env.MONGODB_URI?.trim() || "",
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || "wedplan",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  IMGBB_API_KEY: process.env.IMGBB_API_KEY || "",
};
