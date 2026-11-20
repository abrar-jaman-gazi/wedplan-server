import { Router } from "express";

import { getDatabase } from "../config/database.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.get(
  "/stats",
  authenticate,
  requireRole("admin"),
  async (_req, res) => {
    const database = getDatabase();

    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalServices,
      pendingServices,
      totalTransactions,
    ] = await Promise.all([
      database.collection("users").countDocuments(),
      database.collection("users").countDocuments({
        role: "vendor",
      }),
      database.collection("users").countDocuments({
        role: "customer",
      }),
      database.collection("services").countDocuments(),
      database.collection("services").countDocuments({
        status: {
          $regex: /^pending$/i,
        },
      }),
      database.collection("transactions").countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      message: "Admin dashboard statistics retrieved successfully",
      data: {
        totalUsers,
        totalVendors,
        totalCustomers,
        totalServices,
        pendingServices,
        totalTransactions,
      },
    });
  }
);

export default router;