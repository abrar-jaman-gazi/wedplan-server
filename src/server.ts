import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "WedPlan API is running",
    environment: process.env.NODE_ENV || "development",
  });
});

app.listen(PORT, () => {
  console.log(`WedPlan server running on http://localhost:${PORT}`);
});