
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./config/auth.js";
import { env } from "./config/env.js";
import healthRoutes from "./routes/health.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import serviceRoutes from "./routes/service.routes.js";
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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to WedPlan API",
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/services", serviceRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.use(errorHandler);

export default app;
