import { getDatabase } from "../config/database.js";
import type { Request, Response, NextFunction } from "express";
import type { Document } from "mongodb";

import {
  TRANSACTION_PLANS,
  TRANSACTION_STATUSES,
} from "../models/transaction.model.js";

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

export const getAdminTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10);

    if (page === null || limit === null || limit > 100) {
      res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
      return;
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      res.status(400).json({
        success: false,
        message: "Pagination value is too large",
      });
      return;
    }

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const status =
      typeof req.query.status === "string"
        ? req.query.status.trim().toLowerCase()
        : "";

    const plan =
      typeof req.query.plan === "string"
        ? req.query.plan.trim().toLowerCase()
        : "";

    if (
      status !== "" &&
      status !== "all" &&
      !TRANSACTION_STATUSES.includes(
        status as (typeof TRANSACTION_STATUSES)[number]
      )
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid transaction status filter",
      });
      return;
    }

    if (
      plan !== "" &&
      plan !== "all" &&
      !TRANSACTION_PLANS.includes(
        plan as (typeof TRANSACTION_PLANS)[number]
      )
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid subscription plan filter",
      });
      return;
    }

    const match: Document = {};

    if (status && status !== "all") {
      match.status = status;
    }

    if (plan && plan !== "all") {
      match.plan = plan;
    }

    const pipeline: Document[] = [
      {
        $lookup: {
          from: "users",
          let: {
            vendorId: { $toString: "$vendorId" },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toString: "$_id" },
                    "$$vendorId",
                  ],
                },
              },
            },
            {
              $project: {
                name: 1,
                email: 1,
                image: 1,
                businessName: 1,
              },
            },
          ],
          as: "vendor",
        },
      },
      {
        $unwind: {
          path: "$vendor",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    if (search) {
      const safeSearch = escapeRegex(search);

      pipeline.push({
        $match: {
          $or: [
            { "vendor.name": { $regex: safeSearch, $options: "i" } },
            { "vendor.email": { $regex: safeSearch, $options: "i" } },
            {
              "vendor.businessName": {
                $regex: safeSearch,
                $options: "i",
              },
            },
            { stripeSessionId: { $regex: safeSearch, $options: "i" } },
          ],
        },
      });
    }

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    pipeline.push({
      $facet: {
        transactions: [
          {
            $sort: {
              createdAt: -1,
              _id: -1,
            },
          },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              vendorId: 1,
              vendor: 1,
              plan: 1,
              amount: 1,
              currency: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
              paidAt: 1,
              stripeSessionId: 1,
              stripeSubscriptionId: 1,
            },
          },
        ],
        metadata: [{ $count: "total" }],
      },
    });

   const results = await getDatabase()
  .collection("transactions")
      .aggregate<{
        transactions: Document[];
        metadata: { total: number }[];
      }>(pipeline)
      .toArray();

    const transactions = results[0]?.transactions ?? [];
    const total = results[0]?.metadata[0]?.total ?? 0;

    res.status(200).json({
      success: true,
      message: "Admin transactions retrieved successfully",
      data: transactions,
      pagination: {
        currentPage: page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};
