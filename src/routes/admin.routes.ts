
import { Router, type Response } from "express";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const parsePositiveInteger = (
  value: unknown,
  fallback: number
): number | null => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
};

const userProjection = {
  name: 1,
  email: 1,
  image: 1,
  role: 1,
  isBlocked: 1,
  businessName: 1,
  subscriptionPlan: 1,
  subscriptionExpiresAt: 1,
  createdAt: 1,
};

router.use(authenticate, requireRole("admin"));

router.get("/stats", async (_req, res, next) => {
  try {
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
        approvalStatus: "pending",
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
  } catch (error) {
    next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const database = getDatabase();

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10);

    if (page === null || limit === null || limit > 100) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
      return;
    }

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const role =
      typeof req.query.role === "string"
        ? req.query.role.trim().toLowerCase()
        : "";

    if (
      role !== "" &&
      role !== "all" &&
      role !== "customer" &&
      role !== "vendor"
    ) {
      res.status(400).json({
        success: false,
        message: "Role filter must be customer, vendor, or all",
      });
      return;
    }

    const filter: Record<string, unknown> = {
      role:
        role === "customer" || role === "vendor"
          ? role
          : { $in: ["customer", "vendor"] },
    };

    if (search) {
      const safeSearch = escapeRegex(search);

      filter.$or = [
        {
          name: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          email: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      res.status(400).json({
        success: false,
        message: "Pagination value is too large",
      });
      return;
    }

    const [users, totalUsers] = await Promise.all([
      database
        .collection("users")
        .find(filter, {
          projection: userProjection,
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      database.collection("users").countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: {
        users,
        pagination: {
          currentPage: page,
          limit,
          totalUsers,
          totalPages: Math.ceil(totalUsers / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:id", async (req, res, next) => {
  try {
    const userId = req.params.id;

    if (!ObjectId.isValid(userId)) {
      res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
      return;
    }

    const database = getDatabase();

    const user = await database.collection("users").findOne(
      {
        _id: new ObjectId(userId),
        role: {
          $in: ["customer", "vendor"],
        },
      },
      {
        projection: userProjection,
      }
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User details retrieved successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

const updateUserBlockStatus = async (
  userId: string,
  adminId: string | undefined,
  isBlocked: boolean,
  res: Response
): Promise<void> => {
  if (!ObjectId.isValid(userId)) {
    res.status(400).json({
      success: false,
      message: "Invalid user ID",
    });
    return;
  }

  if (adminId === userId) {
    res.status(403).json({
      success: false,
      message: "You cannot block or unblock your own account",
    });
    return;
  }

  const database = getDatabase();
  const users = database.collection("users");
  const targetId = new ObjectId(userId);

  const targetUser = await users.findOne(
    {
      _id: targetId,
    },
    {
      projection: {
        role: 1,
        isBlocked: 1,
      },
    }
  );

  if (!targetUser) {
    res.status(404).json({
      success: false,
      message: "User not found",
    });
    return;
  }

  if (
    targetUser.role !== "customer" &&
    targetUser.role !== "vendor"
  ) {
    res.status(403).json({
      success: false,
      message: "Admin accounts cannot be modified through this endpoint",
    });
    return;
  }

  const result = await users.updateOne(
    {
      _id: targetId,
      role: {
        $in: ["customer", "vendor"],
      },
    },
    {
      $set: {
        isBlocked,
      },
    }
  );

  if (result.matchedCount === 0) {
    res.status(404).json({
      success: false,
      message: "User not found or account role changed",
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: isBlocked
      ? "User blocked successfully"
      : "User unblocked successfully",
    data: {
      userId,
      isBlocked,
    },
  });
};

router.patch("/users/:id/block", async (req, res, next) => {
  try {
    await updateUserBlockStatus(
      req.params.id,
      req.auth?.userId,
      true,
      res
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id/unblock", async (req, res, next) => {
  try {
    await updateUserBlockStatus(
      req.params.id,
      req.auth?.userId,
      false,
      res
    );
  } catch (error) {
    next(error);
  }
});

export default router;
