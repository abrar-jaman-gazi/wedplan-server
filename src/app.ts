import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./config/auth.js";
import { env } from "./config/env.js";

import healthRoutes from "./routes/health.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminServiceRoutes from "./routes/admin-service.routes.js";
import adminTransactionRoutes from "./routes/admin-transaction.routes.js";
import publicServiceRoutes from "./routes/public-service.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import stripeRoutes from "./routes/stripe.routes.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.routes.js";

import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(
  "/api/stripe/webhook",
  express.raw({
    type: "application/json",
    limit: "1mb",
  }),
  stripeWebhookRoutes
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to WedPlan API",
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/stripe", stripeRoutes);

app.use("/api/services", publicServiceRoutes);
app.use("/api/services", serviceRoutes);

app.use("/api/admin/services", adminServiceRoutes);
app.use("/api/admin/transactions", adminTransactionRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.use(errorHandler);

export default app;