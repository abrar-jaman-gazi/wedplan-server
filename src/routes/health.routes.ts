
import { Router } from "express";
import { getDatabase } from "../config/database.js";

const router = Router();

router.get("/", async (_req, res) => {
  const database = getDatabase();

  await database.command({ ping: 1 });

  res.status(200).json({
    success: true,
    message: "WedPlan API is running",
    database: "connected",
    environment: process.env.NODE_ENV || "development",
  });
});

export default router;
